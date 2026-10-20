#!/usr/bin/env python3
"""Fail builds if personal API credentials or embedded secrets enter this public project."""
from pathlib import Path
import re
import sys

root=Path(__file__).resolve().parents[1]
allowed={'.java','.gradle','.js','.html','.json','.yml','.yaml','.md','.txt','.properties','.py','.ps1','.sh'}
skip={'.git','.gradle','build','.idea'}
issues=[]
patterns=(
    re.compile(r'eyJ[A-Za-z0-9_-]{14,}\.eyJ[A-Za-z0-9_-]{14,}\.[A-Za-z0-9_-]{14,}'),
    re.compile(r'(?:FRAME_LOUNGE_TMDB_KEY|TMDB_API_KEY)\s*[:=]\s*["\']?[a-fA-F0-9]{32}(?![a-fA-F0-9])'),
    re.compile(r'(?:api_key|tmdbKey)\s*[=:]\s*["\']?[a-fA-F0-9]{32}(?![a-fA-F0-9])'),
)
for p in root.rglob('*'):
    if not p.is_file() or p.suffix.lower() not in allowed or any(s in skip for s in p.relative_to(root).parts): continue
    if p.name=='tmdb-config.js': issues.append(str(p.relative_to(root))+' must not exist'); continue
    data=p.read_text(encoding='utf-8', errors='replace')
    if any(pattern.search(data) for pattern in patterns): issues.append(str(p.relative_to(root))+' appears to contain an API credential')
    if p.suffix in {'.p12','.jks','.keystore'}: issues.append(str(p.relative_to(root))+' is a private signing asset')
for p in root.rglob('*'):
    if p.is_file() and p.suffix.lower() in {'.p12','.jks','.keystore','.pfx'}: issues.append(str(p.relative_to(root))+' is a private signing asset')
if issues:
    print('BLOCKED: sensitive file(s) found; do not publish.\n'+'\n'.join(issues))
    sys.exit(1)
print('PUBLIC SOURCE CHECK PASSED: no obvious embedded TMDB credentials or private signing assets.')
