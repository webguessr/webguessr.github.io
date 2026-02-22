import re
import sys
import os
import urllib.request

# ── Blocklist sources ────────────────────────────────────────────────────────
BLOCKLIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'blocklists')

BLOCKLISTS = [
    # ── Adult / NSFW ──────────────────────────────────────────────────────────
    {
        'name': 'blocklistproject-porn',
        'url':  'https://blocklistproject.github.io/Lists/alt-version/porn-nl.txt',
        'fmt':  'plain',
    },
    {
        'name': 'hagezi-nsfw',
        'url':  'https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/wildcard/nsfw-onlydomains.txt',
        'fmt':  'plain',
    },
    {
        'name': 'oisd-nsfw',
        'url':  'https://nsfw.oisd.nl',
        'fmt':  'abp',
    },
    {
        'name': 'stevenblack-porn',
        'url':  'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts',
        'fmt':  'hosts',
    },
    # ── Ads / tracking ───────────────────────────────────────────────────────
    {
        'name': 'blocklistproject-ads',
        'url':  'https://blocklistproject.github.io/Lists/alt-version/ads-nl.txt',
        'fmt':  'plain',
    },
    {
        'name': 'blocklistproject-tracking',
        'url':  'https://blocklistproject.github.io/Lists/alt-version/tracking-nl.txt',
        'fmt':  'plain',
    },
    {
        'name': 'hagezi-multi',
        'url':  'https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/domains/multi.txt',
        'fmt':  'plain',
    },
    {
        'name': 'stevenblack-base',
        'url':  'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
        'fmt':  'hosts',
    },
    {
        'name': 'oisd-big',
        'url':  'https://big.oisd.nl',
        'fmt':  'abp',
    },
    # ── Malware / phishing / scam / fraud ────────────────────────────────────
    {
        'name': 'blocklistproject-malware',
        'url':  'https://blocklistproject.github.io/Lists/alt-version/malware-nl.txt',
        'fmt':  'plain',
    },
    {
        'name': 'blocklistproject-phishing',
        'url':  'https://blocklistproject.github.io/Lists/alt-version/phishing-nl.txt',
        'fmt':  'plain',
    },
    {
        'name': 'blocklistproject-scam',
        'url':  'https://blocklistproject.github.io/Lists/alt-version/scam-nl.txt',
        'fmt':  'plain',
    },
    {
        'name': 'blocklistproject-fraud',
        'url':  'https://blocklistproject.github.io/Lists/alt-version/fraud-nl.txt',
        'fmt':  'plain',
    },
    {
        'name': 'blocklistproject-ransomware',
        'url':  'https://blocklistproject.github.io/Lists/alt-version/ransomware-nl.txt',
        'fmt':  'plain',
    },
    # ── Spam / abuse ─────────────────────────────────────────────────────────
    {
        'name': 'blocklistproject-abuse',
        'url':  'https://blocklistproject.github.io/Lists/alt-version/abuse-nl.txt',
        'fmt':  'plain',
    },
]


def fetch_blocklists(force=False):
    """Download blocklists into BLOCKLIST_DIR, skipping already-fetched files."""
    os.makedirs(BLOCKLIST_DIR, exist_ok=True)
    for bl in BLOCKLISTS:
        path = os.path.join(BLOCKLIST_DIR, bl['name'] + '.txt')
        if os.path.exists(path) and not force:
            print(f"  [cached]  {bl['name']}")
            continue
        print(f"  [fetch]   {bl['name']}  <- {bl['url']}")
        try:
            urllib.request.urlretrieve(bl['url'], path)
            size = os.path.getsize(path)
            print(f"            saved {size:,} bytes")
        except Exception as e:
            print(f"            ERROR: {e}")


def _parse_blocklist(path, fmt):
    domains = set()
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or line.startswith('!'):
                continue
            if fmt == 'hosts':
                # "0.0.0.0 domain.com" or "127.0.0.1 domain.com"
                parts = line.split()
                if len(parts) >= 2 and parts[0] in ('0.0.0.0', '127.0.0.1'):
                    d = parts[1].lower()
                    if d not in ('localhost', 'localhost.localdomain', '0.0.0.0', '::1'):
                        domains.add(d)
            elif fmt == 'abp':
                # "||domain.com^"
                if line.startswith('||') and line.endswith('^'):
                    domains.add(line[2:-1].lower())
            elif fmt == 'plain':
                d = line.lower()
                if d.startswith('*.'):
                    d = d[2:]   # *.example.com -> example.com
                domains.add(d)
    return domains


def load_blocklists():
    """Parse all cached blocklists and return a combined set of domains."""
    all_domains = set()
    for bl in BLOCKLISTS:
        path = os.path.join(BLOCKLIST_DIR, bl['name'] + '.txt')
        if not os.path.exists(path):
            print(f"  [missing] {bl['name']} — run with --fetch to download")
            continue
        domains = _parse_blocklist(path, bl['fmt'])
        print(f"  [loaded]  {bl['name']}: {len(domains):,} domains")
        all_domains.update(domains)
    print(f"  [total]   {len(all_domains):,} unique blocklist domains")
    return all_domains


# ── Regex patterns ───────────────────────────────────────────────────────────
# NOTE: intentionally casts a wide net; some false positives are acceptable.
# Word boundaries kept only where the false positive would be very common
# (e.g. "ass" in "atlassian"/"glassdoor", "tit" in "titanium"/"entity").

PATTERNS = [
    # Porn brands / studios / tube sites
    r'porn',
    r'xnxx', r'xvideos', r'xhamster', r'redtube', r'youporn',
    r'brazzers', r'bangbros', r'realitykings', r'nubile',
    r'tnaflix', r'spankbang', r'spankwire', r'slutload', r'tube8',
    r'tube18', r'18tube', r'tubegalore', r'twistys',
    r'penthousegold', r'girlsway', r'vixen\.com', r'blacked\.com',
    r'adulttime', r'adultdvd', r'adultem',
    r'wankitnow', r'wankz', r'faphouse', r'fapper',
    r'onlyfan', r'chaturbat', r'bongacam', r'stripchat', r'myfreecam',
    r'camfuze', r'camsoda', r'jasminlive', r'livejasmin', r'imlive',
    r'fuckbook', r'fuckswip', r'sexuallybroken', r'goatse', r'tubegalore',
    # Explicit terms — no word boundaries; no legitimate domain uses
    r'xxx',
    r'sex',
    r'fuck',
    r'milf',
    r'slut',
    r'nude',
    r'naked',
    r'erotic',
    r'escort',
    r'mature',
    r'adult',
    r'naughty',
    r'taboo',
    r'kink',
    r'hentai',
    r'erotik',
    r'fetish',
    r'bdsm',
    r'tranny',
    r'incest',
    r'lust',
    r'cum',
    r'horny',
    r'busty',
    r'pussy',
    r'vagina',
    r'blowjob',
    r'handjob',
    r'deepthroat',
    r'gangbang',
    r'creampie',
    r'cuckold',
    r'swinger',
    r'voyeur',
    r'upskirt',
    r'bondage',
    r'spanking',
    r'lesbian',
    r'hotwife',
    r'yiff',
    r'jerkoff|jerk-off',
    r'roughsex',
    r'slutwife',
    r'nympho',
    r'shemale',
    r'strapon|strap-on',
    r'fisting',
    r'rimjob|rimming',
    r'doggystyle',
    r'threesome',
    r'pegging',
    r'gloryhole|glory-hole',
    r'femdom',
    r'ballbust',
    r'jizz',
    r'dildo',
    r'masturbat',
    r'orgasm',
    r'squirt',
    r'wank',
    r'fap',
    r'boob',
    r'tits',
    r'asshole',
    r'cocksucker',
    r'whore',
    r'hooker',
    r'camgirl|camshow|camsex|camgirls',
    r'freesex|livesex',
    r'sexvideo|freeporn|sexporn|sexhd|sexmovie',
    r'bigtit|bigass|bigcock|hardcor',
    r'lesbianvideo|lesbiantube|nudevideo|nudetube|nakedvideo',
    r'maturetube',
    r'18teen|18yo',
    # Terms with boundaries (high false-positive risk without them)
    r'(?<![a-z])anal(?![a-z])',     # not "canal", "penal", "finals"
    r'(?<![a-z])cock(?![a-z])',     # not "peacock", "hancock"
    r'(?<![a-z])ass(?![a-z])',      # not "atlassian", "glassdoor", "password"
    r'(?<![a-z])tit(?![a-z])',      # not "titanium", "entity", "constitution"
    r'(?<![a-z])dick(?![a-z])',     # not "dickssportinggoods"
    r'(?<![a-z])porno(?![a-z])',
    r'(?<![a-z])jav(?![a-z])',      # Japanese Adult Video
    r'(?<![a-z])cam4\.',
    r'kinky(?![a-z])',
]

COMBINED = re.compile('|'.join(PATTERNS), re.IGNORECASE)


def is_adult(domain, blocklist=None):
    if COMBINED.search(domain):
        return True
    if blocklist and domain.lower() in blocklist:
        return True
    return False


def filter_file(input_path, output_path, blocklist=None):
    removed_regex = 0
    removed_blocklist = 0
    kept = 0
    with open(input_path, 'r') as infile, open(output_path, 'w') as outfile:
        for line in infile:
            domain = line.strip()
            if COMBINED.search(domain):
                removed_regex += 1
            elif blocklist and domain.lower() in blocklist:
                removed_blocklist += 1
            else:
                outfile.write(line)
                kept += 1
    return kept, removed_regex, removed_blocklist


if __name__ == '__main__':
    args = sys.argv[1:]
    force_fetch = '--fetch' in args
    args = [a for a in args if a != '--fetch']

    input_path  = args[0] if len(args) > 0 else 'top-1m.csv'
    output_path = args[1] if len(args) > 1 else 'top-1m-filtered.csv'

    print("Blocklists:")
    fetch_blocklists(force=force_fetch)
    blocklist = load_blocklists()

    print(f"\nFiltering {input_path} ...")
    kept, removed_regex, removed_blocklist = filter_file(input_path, output_path, blocklist)

    total_removed = removed_regex + removed_blocklist
    print(f"\nRemoved by regex:      {removed_regex:,}")
    print(f"Removed by blocklist:  {removed_blocklist:,}")
    print(f"Total removed:         {total_removed:,}")
    print(f"Kept:                  {kept:,}")
    print(f"Output:                {output_path}")
