"""Build a reviewable inventory from saved official specs (requires PyYAML)."""
from pathlib import Path
import hashlib
import json
import yaml

ROOT = Path(__file__).resolve().parents[1]
rows = []
manifest = []
IMPLEMENTED_READS = {'getApps', 'getAppByName', 'getAppLogs', 'getAppReleases', 'getAppSummaryReports'}
for service in ('paas', 'dbaas', 'dns'):
    path = ROOT / 'docs' / 'references' / f'{service}.yaml'
    raw = path.read_bytes()
    spec = yaml.safe_load(raw)
    source = f'https://github.com/liara-cloud/openapi/blob/master/spec/{service}.yaml'
    manifest.append({'file': str(path.relative_to(ROOT)), 'source': source, 'sha256': hashlib.sha256(raw).hexdigest(), 'retrievedOn': '2026-10-23'})
    for route, item in spec['paths'].items():
        for method, operation in item.items():
            if method not in ('get', 'post', 'put', 'patch', 'delete'):
                continue
            rows.append({'service': service, 'operation': operation.get('operationId', ''), 'method': method.upper(), 'baseUrl': spec['servers'][0]['url'], 'path': route, 'source': source, 'authentication': operation.get('security', spec.get('security', [])), 'securitySchemes': spec['components']['securitySchemes'], 'parameters': item.get('parameters', []) + operation.get('parameters', []), 'requestBody': operation.get('requestBody'), 'responses': operation['responses'], 'approval': 'disabled-in-mvp' if method == 'delete' else 'required' if method != 'get' else 'read-only-authorized', 'implemented': False, 'liveVerified': False, 'permission': 'User-owned resource; provider account/team permission must be verified', 'limitations': 'Specification only; schema references resolve in the saved service YAML. Runtime contract and permission checks pending.'})
for row in rows:
    if row['service'] == 'paas' and row['operation'] in IMPLEMENTED_READS:
        row['implemented'] = True
        row['implementation'] = 'packages/liara-adapter/src/client.ts'
        row['tests'] = ['tests/liara-adapter.test.ts', 'tests/liara-api.test.ts']
        row['limitations'] = 'Validated with deterministic official-contract fixtures. Live verification pending credentials. Metric units are not inferred.'
for row in rows:
    if row['service'] == 'paas' and row['operation'] in {'sourcesDeploy', 'releasesDeploy'}:
        row.update(implemented=True, implementation='packages/deployment/src/provider.ts', tests=['tests/deployment-unit.test.ts', 'tests/deployment-api.test.ts'], limitations='Approval-bound existing Node application workflow only; fixture-tested, live PaaS verification pending. No blind retries.')
(ROOT / 'docs/references/manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(ROOT / 'docs/API_CAPABILITIES.json').write_text(json.dumps(rows, indent=2, ensure_ascii=False) + '\n')
lines = ['# Official Liara capability inventory', '', 'Reviewed: 2026-10-23. Five read and two approval-bound deployment operations are implemented and fixture-tested; **all live verification remains pending credentials**.', '', 'The JSON companion preserves parameters, request bodies, response contracts, authentication schemes and source links for every entry. Resolve schema references in references/*.yaml. All reads require ownership and provider permission checks; mutations additionally require operation-specific approval. DELETE operations remain disabled in the MVP. Provider permission names are not established by these specs.', '', '| Service | Operation | Method and path | Approval | Implemented / live verified |', '|---|---|---|---|---|']
for row in rows:
    lines.append(f"| {row['service']} | [{row['operation']}]({row['source']}) | `{row['method']} {row['path']}` | {row['approval']} | {'Yes' if row['implemented'] else 'No'} / No |")
lines += ['', '## Important integration decisions', '', '- PaaS and DBaaS base URL: https://api.liara.ir; DNS: https://dns-service.liara.ir.', '- PaaS/DBaaS declare Authorization apiKey and HTTP bearer alternatives; DNS declares Authorization apiKey. The official API guide confirms Bearer authentication and teamID for the implemented PaaS adapter; DNS/DBaaS adapters are not implemented. See https://docs.liara.ir/references/api/about/.', '- Source upload: POST /v2/projects/{name}/sources, multipart file (.gz), yields sourceID. Release creation is a separate POST /v2/projects/{name}/releases with Deploy-releases schema; yields releaseID. Neither acknowledgment proves deployment health.', '- Supplemental CLI contract: GET /v2/projects/{name}/logs is implemented from official CLI source (references/liara-cli-logs.ts.txt), outside this OpenAPI inventory. Only a 404 permits fallback to the legacy logs route; see LIARA_INTEGRATION.md.', '- CPU/memory report routes exist, but units, time semantics, retention and response behavior must be confirmed before labeling charts.', '- Application detail responses include environment values. Strip secrets before persistence, UI output, logs and LLM context.', '- No verified plan catalog or pricing contract has been established. Do not use example plan IDs as recommendations.', '- CLI fallback candidates: liara deploy, liara app logs, liara app restart. Official README snapshot is saved in references/liara-cli.md. CLI version, implementation, credential transport and worker isolation remain pending; arbitrary shell and remote shell are excluded.', '- DNS record management does not grant registrar access. IRNIC nameserver changes remain guided manual actions.', '- Connection validation uses an authorized read, rather than an invented token-validation endpoint.', '- Snapshot hashes are recorded in references/manifest.json; master is mutable, so refresh and review diffs before implementation.']
(ROOT / 'docs/API_CAPABILITIES.md').write_text('\n'.join(lines) + '\n')
print(f'Inventoried {len(rows)} API operations across {len(manifest)} official specifications.')
