// Planning model only. No network, credentials, provisioning, or application benchmarks.
const scenarios = [
  { name: 'light', ebs: 80, backupGB: 23, put: 10000, get: 10000, snapshotGB: 20,
    operations: 10000, reads: 500000, authorityGB: .25, s3AuthorityGB: 1,
    queries: 100000, monitoring: 2, audit: .1, external: 3, egressGB: 20, surplusCPUHours: 0 },
  { name: 'full_pair', ebs: 120, backupGB: 75, put: 100000, get: 200000, snapshotGB: 40,
    operations: 100000, reads: 2000000, authorityGB: 1, s3AuthorityGB: 2,
    queries: 250000, monitoring: 3, audit: .5, external: 5, egressGB: 80, surplusCPUHours: 40 },
  { name: 'rotation', ebs: 220, backupGB: 156, put: 500000, get: 1000000, snapshotGB: 80,
    operations: 500000, reads: 10000000, authorityGB: 2, s3AuthorityGB: 5,
    queries: 1000000, monitoring: 6, audit: 1.5, external: 10, egressGB: 300, surplusCPUHours: 200 },
];
const round = n => Math.round(n * 100) / 100;
const output = scenarios.map(s => {
  const costs = {
    ec2: 730 * .0336, ebs: s.ebs * .08, ipv4: 730 * .005,
    dns: .5 + s.queries * .4 / 1e6,
    s3BackupStorage: s.backupGB * .023, s3BackupRequests: s.put * .000005 + s.get * .0000004,
    authority: s.operations * 16 * .000000625 + s.reads * .000000125 + s.authorityGB * (.25 + .20),
    snapshots: s.snapshotGB * .05, monitoring: s.monitoring, audit: s.audit,
    internetEgress: Math.max(0, s.egressGB - 100) * .09,
    cpuSurplus: s.surplusCPUHours * .04, externalAllocation: s.external, domainAllocation: 1.5,
  };
  const total = Object.values(costs).reduce((a, b) => a + b, 0);
  const s3Authority = s.operations * 4 * .000005 + s.reads * .0000004 + s.s3AuthorityGB * .023;
  return { assumptions: s, costs: Object.fromEntries(Object.entries(costs).map(([k,v]) => [k, round(v)])),
    totalUSD: round(total), s3AuthorityUSD: round(s3Authority),
    totalWithS3AuthorityUSD: round(total - costs.authority + s3Authority) };
});
console.log(JSON.stringify({ hours: 730, currency: 'USD', taxExcluded: true,
  status: 'PLANNING_NOT_BENCHMARKED', sharedInternetAllowanceGB: 100,
  authorityModel: '4 transactional <=1KB items/phase; PREPARE+ACK; strong <=4KB reads', scenarios: output }, null, 2));
