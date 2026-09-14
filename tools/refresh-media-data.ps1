# MCUWeb data pipeline — media detail refresh
# Enriches data/media-cache.json with TMDB (poster, blurb, rating, streaming
# availability) and OMDb (IMDb rating) for every timeline entry, so the site
# never calls either API from a visitor's browser and neither API key ever
# reaches client code.
#
# Cadence: an entry is only re-fetched when it's actually due (see
# Test-Stale) - anything released within the last/next ~6 months is
# rechecked monthly, anything older is only rechecked every ~6 months.
# Run this as often as you like (the workflow runs it weekly); it's a
# no-op for anything not yet due.
#
# Manual corrections: add { "<node-id>": { "tmdbId": 123, "mediaType": "movie" } }
# to data/media-overrides.json for any title the automatic search gets
# wrong or can't find (node-id = that entry's "id" in data/timeline.json).
#
# Works on Windows PowerShell 5.1 and pwsh (GitHub Actions ubuntu runners).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools\refresh-media-data.ps1
# Requires env vars TMDB_API_KEY and OMDB_API_KEY.

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path $PSScriptRoot -Parent
$timelinePath = "$root/data/timeline.json"
$cachePath = "$root/data/media-cache.json"
$overridesPath = "$root/data/media-overrides.json"
$region = "GB"
$userAgent = "MCUWebBot/0.1 (personal project; jsward.business@gmail.com)"

$tmdbKey = $env:TMDB_API_KEY
$omdbKey = $env:OMDB_API_KEY
if (-not $tmdbKey) { Write-Host "TMDB_API_KEY not set - aborting."; exit 1 }
if (-not $omdbKey) { Write-Host "OMDB_API_KEY not set - aborting."; exit 1 }

# ------------------------------------------------------------------- data ---

$dataObj = Get-Content $timelinePath -Raw -Encoding UTF8 | ConvertFrom-Json
$nodes = @($dataObj.nodes)
Write-Host "Loaded $($nodes.Count) timeline entries from data/timeline.json."

$overrides = @{}
if (Test-Path $overridesPath) {
    (Get-Content $overridesPath -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties | ForEach-Object {
        $overrides[$_.Name] = $_.Value
    }
}

$cache = @{}
if (Test-Path $cachePath) {
    $existingJson = Get-Content $cachePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($existingJson.entries) {
        $existingJson.entries.PSObject.Properties | ForEach-Object { $cache[$_.Name] = $_.Value }
    }
}

# Strips the trailing "(...)" date parenthetical, and — for TV entries only
# — the season/episode-range suffix (e.g. "Agents of S.H.I.E.L.D. S5, Eps.
# 1-19" -> "Agents of S.H.I.E.L.D."), since TMDB only knows the show as a
# whole, not individual episode ranges.
function Get-CleanTitle($node) {
    $t = $node.label -replace "\s*\([^)]*\)\s*$", ""
    if ($node.format -eq "tv") {
        $t = $t -replace "\s+S\d+.*$", ""
    }
    $t = $t -replace "^One-Shot:\s*", ""
    $t.Trim()
}

# ---------------------------------------------------------------- staleness ---

function Test-Stale($cached) {
    if (-not $cached) { return $true }
    if (-not $cached.fetchedAt) { return $true }
    $fetched = [datetime]::Parse($cached.fetchedAt, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)
    $ageDays = (New-TimeSpan -Start $fetched -End (Get-Date).ToUniversalTime()).TotalDays

    $recent = $true
    if ($cached.releaseDate) {
        try {
            $rel = [datetime]::Parse($cached.releaseDate, [Globalization.CultureInfo]::InvariantCulture)
            $relAgeDays = [Math]::Abs((New-TimeSpan -Start $rel -End (Get-Date).ToUniversalTime()).TotalDays)
            $recent = $relAgeDays -le 183
        } catch { $recent = $true }
    }

    if ($recent) { return $ageDays -ge 30 }
    return $ageDays -ge 183
}

# -------------------------------------------------------------------- TMDB ---

function Invoke-Tmdb($path, $apiKey, $query) {
    $qs = "api_key=$apiKey"
    if ($query) { $qs += "&$query" }
    $url = "https://api.themoviedb.org/3/$path`?$qs"
    try { Invoke-RestMethod -Uri $url -Headers @{ "User-Agent" = $userAgent } -TimeoutSec 30 }
    catch { $null }
}

function Get-NormTitle([string]$s) {
    $n = $s.ToLowerInvariant()
    # TMDB titles are inconsistent about spelled-out vs numeral (e.g. the
    # 2025 film is officially "The Fantastic 4: First Steps", not "Four") -
    # normalise small numbers so that kind of mismatch doesn't break matching.
    $n = $n -replace "\bone\b", "1" -replace "\btwo\b", "2" -replace "\bthree\b", "3" -replace "\bfour\b", "4" -replace "\bfive\b", "5"
    ($n -replace "[^a-z0-9]+", " ").Trim()
}

# TMDB's "popularity" is a volatile, day-to-day activity score - not a
# reliable signal of which result is "the real, famous thing" (a fan short
# or an unreleased placeholder can easily outrank a well-known film on a
# given day), so it's not used here at all.
#
# A candidate must clear TWO independent bars to even be considered:
#   - title relation: exact normalised-title match, or one contains the
#     other (handles e.g. "Fantastic Four" vs "Fantastic 4: ...")
#   - year sanity: within 5 years of the node's year (or the candidate has
#     no date at all, e.g. an unannounced/TBD entry) - this is a HARD
#     exclusion, not just a sort preference, specifically because a
#     same-titled-but-unrelated reboot/remake/unrelated show (e.g. a 2023
#     series called "The Consultant" vs our 2011 Marvel One-Shot of the
#     same name) must never win just for having more votes.
# Among what's left: exact title beats substring, closest year wins next,
# vote_count (far more stable than popularity) breaks any remaining tie.
function Select-BestCandidate($results, $searchTitle, $year, $dateField) {
    if (-not $results -or $results.Count -eq 0) { return $null }
    $normSearch = Get-NormTitle $searchTitle

    $candidates = @()
    foreach ($r in $results) {
        # Exclude promo/BTS/premiere-event "video" entries (TMDB flags these
        # separately from the real release) - they otherwise sometimes win
        # on a title technicality when the real release's official title
        # doesn't textually match our cleaned label (see numeral note above).
        if ($r.video -eq $true) { continue }

        $candTitle = if ($r.title) { $r.title } else { $r.name }
        $normCand = Get-NormTitle $candTitle
        $related = ($normCand -eq $normSearch) -or $normCand.Contains($normSearch) -or $normSearch.Contains($normCand)
        if (-not $related) { continue }

        $rYear = $null
        $rDate = $r.$dateField
        if ($rDate -and $rDate.Length -ge 4) { $rYear = [int]($rDate.Substring(0,4)) }

        $yearDist = 2
        if ($year -and $rYear) {
            $yearDist = [Math]::Abs($rYear - [int]$year)
            if ($yearDist -gt 5) { continue }
        }

        $candidates += [pscustomobject]@{ r = $r; exact = ($normCand -eq $normSearch); yearDist = $yearDist; voteCount = [int]$r.vote_count }
    }
    if ($candidates.Count -eq 0) { return $null }

    $best = $candidates | Sort-Object @{Expression="exact";Descending=$true}, "yearDist", @{Expression="voteCount";Descending=$true} | Select-Object -First 1
    $best.r
}

function Get-TmdbMatch($title, $year, $preferredType, $apiKey) {
    function TrySearch($type, $q) {
        $res = Invoke-Tmdb "search/$type" $apiKey "query=$q"
        if ($res -and $res.results) { return @($res.results) }
        return @()
    }

    $encoded = [System.Net.WebUtility]::UrlEncode($title)
    $order = if ($preferredType -eq "tv") { @("tv","movie") } else { @("movie","tv") }
    foreach ($type in $order) {
        $field = if ($type -eq "tv") { "first_air_date" } else { "release_date" }
        $cand = Select-BestCandidate (TrySearch $type $encoded) $title $year $field
        if ($cand) { return @{ id = $cand.id; type = $type } }
    }

    # Marvel One-Shots are sometimes only findable with this exact prefix
    if ($title -notmatch "^Marvel One-Shot") {
        $altTitle = "Marvel One-Shot: $title"
        $alt = [System.Net.WebUtility]::UrlEncode($altTitle)
        $cand = Select-BestCandidate (TrySearch "movie" $alt) $altTitle $year "release_date"
        if ($cand) { return @{ id = $cand.id; type = "movie" } }
    }

    return $null
}

function Get-TmdbEntry($id, $type, $apiKey, $region) {
    $details = Invoke-Tmdb "$type/$id" $apiKey $null
    if (-not $details) { return $null }

    $imdbId = $null
    if ($type -eq "movie") { $imdbId = $details.imdb_id }
    else {
        $ext = Invoke-Tmdb "$type/$id/external_ids" $apiKey $null
        if ($ext) { $imdbId = $ext.imdb_id }
    }

    $providers = Invoke-Tmdb "$type/$id/watch/providers" $apiKey $null
    $watch = $null
    if ($providers -and $providers.results -and $providers.results.$region) {
        $regionData = $providers.results.$region
        foreach ($bucket in @("flatrate","free","ads","rent","buy")) {
            $list = $regionData.$bucket
            if ($list -and $list.Count -gt 0) {
                $top = $list | Sort-Object display_priority | Select-Object -First 1
                $watch = @{
                    type = $bucket
                    provider = $top.provider_name
                    logo = "https://image.tmdb.org/t/p/w92$($top.logo_path)"
                    link = $regionData.link
                }
                break
            }
        }
    }

    $title = if ($type -eq "movie") { $details.title } else { $details.name }
    $releaseDate = if ($type -eq "movie") { $details.release_date } else { $details.first_air_date }
    $poster = if ($details.poster_path) { "https://image.tmdb.org/t/p/w500$($details.poster_path)" } else { $null }

    @{
        mediaType = $type
        tmdbId = $id
        title = $title
        overview = $details.overview
        poster = $poster
        releaseDate = $releaseDate
        tmdbRating = $details.vote_average
        tmdbVoteCount = $details.vote_count
        imdbId = $imdbId
        watch = $watch
    }
}

function Get-ImdbRating($imdbId, $apiKey) {
    if (-not $imdbId) { return $null }
    try {
        $res = Invoke-RestMethod -Uri "https://www.omdbapi.com/?i=$imdbId&apikey=$apiKey" -TimeoutSec 20
        if ($res.Response -eq "True" -and $res.imdbRating -and $res.imdbRating -ne "N/A") {
            return [double]$res.imdbRating
        }
    } catch { }
    return $null
}

# ------------------------------------------------------------------- main ---

$newCache = [ordered]@{}
$fetched = 0; $skipped = 0; $unmatched = 0
# Memoises the TMDB match per clean-title so that e.g. "Daredevil S1/S2/S3"
# always resolve to the same show, instead of each season's independent
# search risking a different (and possibly wrong) result.
$resolutionCache = @{}

foreach ($node in $nodes) {
    $slug = $node.id
    $existing = $cache[$slug]
    $override = $overrides[$slug]

    # A manual override that doesn't match what's already cached - either
    # freshly set, changed, or cleared since the last run - must be applied
    # on this run regardless of the staleness cadence below; otherwise a
    # newly-set (or newly-cleared) override could sit ignored for months.
    $overrideMismatch = $false
    if ($override -and $override.tmdbId) {
        $overrideMismatch = (-not $existing) -or ($existing.tmdbId -ne $override.tmdbId) -or ($existing.mediaType -ne $override.mediaType)
    } elseif ($existing -and $existing.manualMatch) {
        $overrideMismatch = $true
    }

    if (-not $overrideMismatch -and -not (Test-Stale $existing)) {
        $newCache[$slug] = $existing
        $skipped++
        continue
    }

    Write-Host "Refreshing: $($node.label)"
    $entry = $null
    try {
        $match = $null
        if ($override -and $override.tmdbId) {
            $match = @{ id = $override.tmdbId; type = $override.mediaType }
        } else {
            $cleanTitle = Get-CleanTitle $node
            $preferredType = if ($node.format -eq "tv") { "tv" } else { "movie" }
            $cacheKey = "$preferredType|$cleanTitle"
            if ($resolutionCache.ContainsKey($cacheKey)) {
                $match = $resolutionCache[$cacheKey]
            } else {
                $match = Get-TmdbMatch $cleanTitle $node.year $preferredType $tmdbKey
                if ($match) { $resolutionCache[$cacheKey] = $match }
            }
        }

        if ($match) {
            $tmdbEntry = Get-TmdbEntry $match.id $match.type $tmdbKey $region
            if ($tmdbEntry) {
                $imdbRating = Get-ImdbRating $tmdbEntry.imdbId $omdbKey
                $entry = [ordered]@{
                    slug = $slug; label = $node.label; matched = $true
                    mediaType = $tmdbEntry.mediaType; tmdbId = $tmdbEntry.tmdbId
                    title = $tmdbEntry.title; overview = $tmdbEntry.overview
                    poster = $tmdbEntry.poster; releaseDate = $tmdbEntry.releaseDate
                    tmdbRating = $tmdbEntry.tmdbRating; tmdbVoteCount = $tmdbEntry.tmdbVoteCount
                    imdbId = $tmdbEntry.imdbId; imdbRating = $imdbRating
                    watch = $tmdbEntry.watch
                    manualMatch = [bool]($override -and $override.tmdbId)
                    fetchedAt = (Get-Date).ToUniversalTime().ToString("o")
                }
                $fetched++
                Write-Host "  matched -> $($tmdbEntry.title) [$($tmdbEntry.mediaType) $($tmdbEntry.tmdbId)]  TMDB=$($tmdbEntry.tmdbRating) IMDb=$imdbRating"
            }
        }

        if (-not $entry) {
            $entry = [ordered]@{ slug = $slug; label = $node.label; matched = $false; fetchedAt = (Get-Date).ToUniversalTime().ToString("o") }
            $unmatched++
            Write-Host "  NO MATCH"
        }
    } catch {
        Write-Host "  ERROR refreshing $($node.label): $($_.Exception.Message)"
        if ($existing) { $entry = $existing }
        else { $entry = [ordered]@{ slug = $slug; label = $node.label; matched = $false; fetchedAt = (Get-Date).ToUniversalTime().ToString("o") } }
        $unmatched++
    }

    $newCache[$slug] = $entry
    Start-Sleep -Milliseconds 250
}

$output = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    region = $region
    entries = $newCache
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($cachePath, (ConvertTo-Json -InputObject $output -Depth 12), $utf8NoBom)

Write-Host ""
Write-Host "Done: $fetched refreshed, $skipped unchanged, $unmatched unmatched, $($nodes.Count) total."
