# Official Liara capability inventory

Reviewed: 2026-10-23. Five read and two approval-bound deployment operations are implemented and fixture-tested; **all live verification remains pending credentials**.

The JSON companion preserves parameters, request bodies, response contracts, authentication schemes and source links for every entry. Resolve schema references in references/*.yaml. All reads require ownership and provider permission checks; mutations additionally require operation-specific approval. DELETE operations remain disabled in the MVP. Provider permission names are not established by these specs.

| Service | Operation | Method and path | Approval | Implemented / live verified |
|---|---|---|---|---|
| paas | [getApps](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `GET /v1/projects` | read-only-authorized | Yes / No |
| paas | [createApp](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v1/projects` | required | No / No |
| paas | [getAppByName](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `GET /v1/projects/{name}` | read-only-authorized | Yes / No |
| paas | [deleteAppByName](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `DELETE /v1/projects/{name}` | disabled-in-mvp | No / No |
| paas | [turnApp](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v1/projects/{name}/actions/scale` | required | No / No |
| paas | [restartApp](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v1/projects/{name}/actions/restart` | required | No / No |
| paas | [sourcesDeploy](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v2/projects/{name}/sources` | required | Yes / No |
| paas | [releasesDeploy](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v2/projects/{name}/releases` | required | Yes / No |
| paas | [zeroDowntime](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v1/projects/{id}/zero-downtime/{status}` | required | No / No |
| paas | [defaultSubdomain](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v1/projects/{id}/default-subdomain/{status}` | required | No / No |
| paas | [ipStatic](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v1/projects/{id}/fixed-ip/{status}` | required | No / No |
| paas | [readOnly](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v1/projects/{id}/read-only/{status}` | required | No / No |
| paas | [updateEnvs](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v1/projects/update-envs` | required | No / No |
| paas | [changePlan](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v1/projects/{name}/resize` | required | No / No |
| paas | [createFtp](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v1/projects/{name}/disks/{dname}/ftp` | required | No / No |
| paas | [getFtps](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `GET /v1/projects/{name}/disks/{dname}/ftp` | read-only-authorized | No / No |
| paas | [getDisks](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `GET /v1/projects/{id}/disks` | read-only-authorized | No / No |
| paas | [getBackups](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `GET /v1/projects/{id}/disks/{name}/backups` | read-only-authorized | No / No |
| paas | [createBackup](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v1/projects/{id}/disks/{name}/backups` | required | No / No |
| paas | [downloadBackup](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v1/projects/{id}/disks/{dname}/backups/{bname}/download` | required | No / No |
| paas | [resizeDisk](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v1/projects/{name}/disks/{dname}/resize` | required | No / No |
| paas | [createDisk](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v1/projects/{name}/disks` | required | No / No |
| paas | [deleteDisk](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `DELETE /v1/projects/{id}/disks/{name}` | disabled-in-mvp | No / No |
| paas | [deleteFtp](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `DELETE /v1/ftp/{fname}` | disabled-in-mvp | No / No |
| paas | [checkDomain](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `GET /v1/domains/{id}/check` | read-only-authorized | No / No |
| paas | [getAppLogs](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `GET /v1/projects/{name}/logs` | read-only-authorized | Yes / No |
| paas | [getAppEvents](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `GET /v1/projects/{name}/events` | read-only-authorized | No / No |
| paas | [getAppApplets](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `GET /v1/projects/{name}/applets` | read-only-authorized | No / No |
| paas | [getAppReleases](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `GET /v1/projects/{name}/releases` | read-only-authorized | Yes / No |
| paas | [getAppSummaryReports](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `GET /v1/projects/{name}/metrics/summary` | read-only-authorized | Yes / No |
| paas | [getAppCpuReports](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `GET /v1/projects/{name}/metrics/cpu` | read-only-authorized | No / No |
| paas | [getAppMemoryReports](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `GET /v1/projects/{name}/metrics/memory` | read-only-authorized | No / No |
| paas | [getAppNetworkReceiveReports](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `GET /v1/projects/{name}/metrics/network-receive` | read-only-authorized | No / No |
| paas | [getNetworkTransmitReports](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `GET /v1/projects/{name}/metrics/network-transmit` | read-only-authorized | No / No |
| paas | [getAppDomains](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `GET /v1/domains` | read-only-authorized | No / No |
| paas | [createAppDomain](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v1/domains` | required | No / No |
| paas | [setAppDomain](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v1/domains/set-project` | required | No / No |
| paas | [redirectDomain](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v1/domains/{id}/set-redirect` | required | No / No |
| paas | [disableSsl](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v1/domains/{id}/ssl/disable` | required | No / No |
| paas | [enableSsl](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `POST /v1/domains/provision-ssl-certs` | required | No / No |
| paas | [deleteDomain](https://github.com/liara-cloud/openapi/blob/master/spec/paas.yaml) | `DELETE /v1/domains/{id}` | disabled-in-mvp | No / No |
| dbaas | [getDatabase](https://github.com/liara-cloud/openapi/blob/master/spec/dbaas.yaml) | `GET /v1/databases/{id}` | read-only-authorized | No / No |
| dbaas | [deleteDatabase](https://github.com/liara-cloud/openapi/blob/master/spec/dbaas.yaml) | `DELETE /v1/databases/{id}` | disabled-in-mvp | No / No |
| dbaas | [getListDatabases](https://github.com/liara-cloud/openapi/blob/master/spec/dbaas.yaml) | `GET /v1/databases` | read-only-authorized | No / No |
| dbaas | [createDatabase](https://github.com/liara-cloud/openapi/blob/master/spec/dbaas.yaml) | `POST /v1/databases` | required | No / No |
| dbaas | [TurnDatabase](https://github.com/liara-cloud/openapi/blob/master/spec/dbaas.yaml) | `POST /v1/databases/{id}/actions/scale` | required | No / No |
| dbaas | [resizeDatabase](https://github.com/liara-cloud/openapi/blob/master/spec/dbaas.yaml) | `POST /v1/databases/{id}/resize` | required | No / No |
| dbaas | [getListBackups](https://github.com/liara-cloud/openapi/blob/master/spec/dbaas.yaml) | `GET /v1/databases/{id}/backups` | read-only-authorized | No / No |
| dbaas | [createBackup](https://github.com/liara-cloud/openapi/blob/master/spec/dbaas.yaml) | `POST /v1/databases/{id}/backups` | required | No / No |
| dbaas | [databasesSettings](https://github.com/liara-cloud/openapi/blob/master/spec/dbaas.yaml) | `PATCH /v1/databases/{id}/settings` | required | No / No |
| dbaas | [downloadBackup](https://github.com/liara-cloud/openapi/blob/master/spec/dbaas.yaml) | `POST /v1/databases/{id}/backups/{name}/download` | required | No / No |
| dbaas | [changeControlPanel](https://github.com/liara-cloud/openapi/blob/master/spec/dbaas.yaml) | `POST /v1/databases/{id}/control-panel/{status}` | required | No / No |
| dbaas | [changePublicNetwork](https://github.com/liara-cloud/openapi/blob/master/spec/dbaas.yaml) | `PATCH /v1/databases/{id}/public-network/{status}` | required | No / No |
| dbaas | [getDatabaseCpuReports](https://github.com/liara-cloud/openapi/blob/master/spec/dbaas.yaml) | `GET /v1/databases/{id}/metrics/cpu` | read-only-authorized | No / No |
| dbaas | [getDatabaseMemoryReports](https://github.com/liara-cloud/openapi/blob/master/spec/dbaas.yaml) | `GET /v1/databases/{id}/metrics/memory` | read-only-authorized | No / No |
| dbaas | [getDatabaseNetworkReceiveReports](https://github.com/liara-cloud/openapi/blob/master/spec/dbaas.yaml) | `GET /v1/databases/{id}/metrics/network-receive` | read-only-authorized | No / No |
| dbaas | [getDatabaseNetworkTransmitReports](https://github.com/liara-cloud/openapi/blob/master/spec/dbaas.yaml) | `GET /v1/databases/{id}/metrics/network-transmit` | read-only-authorized | No / No |
| dbaas | [getDatabaseSummaryReports](https://github.com/liara-cloud/openapi/blob/master/spec/dbaas.yaml) | `GET /v1/databases/{id}/metrics/summary` | read-only-authorized | No / No |
| dbaas | [getDatabaseEvents](https://github.com/liara-cloud/openapi/blob/master/spec/dbaas.yaml) | `GET /v1/databases/{name}/events` | read-only-authorized | No / No |
| dns | [getListZones](https://github.com/liara-cloud/openapi/blob/master/spec/dns.yaml) | `GET /api/v1/zones` | read-only-authorized | No / No |
| dns | [createZone](https://github.com/liara-cloud/openapi/blob/master/spec/dns.yaml) | `POST /api/v1/zones` | required | No / No |
| dns | [getZone](https://github.com/liara-cloud/openapi/blob/master/spec/dns.yaml) | `GET /api/v1/zones/{zone}` | read-only-authorized | No / No |
| dns | [deleteZone](https://github.com/liara-cloud/openapi/blob/master/spec/dns.yaml) | `DELETE /api/v1/zones/{zone}` | disabled-in-mvp | No / No |
| dns | [checkNameServer](https://github.com/liara-cloud/openapi/blob/master/spec/dns.yaml) | `PUT /api/v1/zones/{zone}/check` | required | No / No |
| dns | [getListDnsRecords](https://github.com/liara-cloud/openapi/blob/master/spec/dns.yaml) | `GET /api/v1/zones/{zone}/dns-records` | read-only-authorized | No / No |
| dns | [createDnsRecord](https://github.com/liara-cloud/openapi/blob/master/spec/dns.yaml) | `POST /api/v1/zones/{zone}/dns-records` | required | No / No |
| dns | [getDnsRecord](https://github.com/liara-cloud/openapi/blob/master/spec/dns.yaml) | `GET /api/v1/zones/{zone}/dns-records/{id}` | read-only-authorized | No / No |
| dns | [editDnsRecord](https://github.com/liara-cloud/openapi/blob/master/spec/dns.yaml) | `PUT /api/v1/zones/{zone}/dns-records/{id}` | required | No / No |
| dns | [deleteDnsRecord](https://github.com/liara-cloud/openapi/blob/master/spec/dns.yaml) | `DELETE /api/v1/zones/{zone}/dns-records/{id}` | disabled-in-mvp | No / No |

## Important integration decisions

- PaaS and DBaaS base URL: https://api.liara.ir; DNS: https://dns-service.liara.ir.
- PaaS/DBaaS declare Authorization apiKey and HTTP bearer alternatives; DNS declares Authorization apiKey. The official API guide confirms Bearer authentication and teamID for the implemented PaaS adapter; DNS/DBaaS adapters are not implemented. See https://docs.liara.ir/references/api/about/.
- Source upload: POST /v2/projects/{name}/sources, multipart file (.gz), yields sourceID. Release creation is a separate POST /v2/projects/{name}/releases with Deploy-releases schema; yields releaseID. Neither acknowledgment proves deployment health.
- Supplemental CLI contract: GET /v2/projects/{name}/logs is implemented from official CLI source (references/liara-cli-logs.ts.txt), outside this OpenAPI inventory. Only a 404 permits fallback to the legacy logs route; see LIARA_INTEGRATION.md.
- CPU/memory report routes exist, but units, time semantics, retention and response behavior must be confirmed before labeling charts.
- Application detail responses include environment values. Strip secrets before persistence, UI output, logs and LLM context.
- No verified plan catalog or pricing contract has been established. Do not use example plan IDs as recommendations.
- CLI fallback candidates: liara deploy, liara app logs, liara app restart. Official README snapshot is saved in references/liara-cli.md. CLI version, implementation, credential transport and worker isolation remain pending; arbitrary shell and remote shell are excluded.
- DNS record management does not grant registrar access. IRNIC nameserver changes remain guided manual actions.
- Connection validation uses an authorized read, rather than an invented token-validation endpoint.
- Snapshot hashes are recorded in references/manifest.json; master is mutable, so refresh and review diffs before implementation.
