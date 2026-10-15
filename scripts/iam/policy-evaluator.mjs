// Bounded offline model, NOT the AWS IAM Policy Simulator. Unknown operators
// throw instead of silently granting. SCPs, sessions and resource policies are
// outside this model; AWS service request context must be verified separately.
import assert from 'node:assert/strict';
export const list = value => Array.isArray(value) ? value : [value];
export function glob(pattern, value, ignoreCase = false) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*').replaceAll('?', '.');
  return new RegExp(`^${escaped}$`, ignoreCase ? 'i' : '').test(value);
}
// Nonempty intersection of two '*'/'?' glob languages. Used only for SAR ARN
// pattern compatibility, never as a substitute for authorization evaluation.
export function intersects(a, b) {
  const memo = new Map();
  const visit = (i, j) => {
    const key = `${i}:${j}`;
    if (memo.has(key)) return memo.get(key);
    memo.set(key, false);
    let found;
    if (i === a.length) found = b.slice(j).split('').every(c => c === '*');
    else if (j === b.length) found = a.slice(i).split('').every(c => c === '*');
    else if (a[i] === '*') found = visit(i + 1, j) || visit(i, j + 1);
    else if (b[j] === '*') found = visit(i, j + 1) || visit(i + 1, j);
    else found = (a[i] === b[j] || a[i] === '?' || b[j] === '?') && visit(i + 1, j + 1);
    memo.set(key, found);
    return found;
  };
  return visit(0, 0);
}
function conditions(conditions, context) {
  return Object.entries(conditions || {}).every(([operator, entries]) => Object.entries(entries).every(([key, expected]) => {
    const actual = context[key];
    if (operator === 'Null') return (actual === undefined || actual === null || (Array.isArray(actual) && actual.length === 0)) === (String(expected) === 'true');
    const [set, op] = operator.includes(':') ? operator.split(':') : [null, operator];
    assert.ok(['StringEquals', 'StringEqualsIgnoreCase', 'ArnEquals', 'StringLike', 'ArnLike', 'Bool', 'StringNotEquals', 'ArnNotEquals'].includes(op), `Unsupported IAM operator ${operator}`);
    const negated = ['StringNotEquals', 'ArnNotEquals'].includes(op);
    const match = value => {
      const found = list(expected).some(e => ['StringLike', 'ArnLike'].includes(op) ? glob(String(e), String(value)) : op === 'StringEqualsIgnoreCase' ? String(value).toLowerCase() === String(e).toLowerCase() : String(value) === String(e));
      return negated ? !found : found;
    };
    if (set === 'ForAllValues') return actual === undefined || list(actual).every(match);
    if (actual === undefined || actual === null) return set === 'ForAnyValue' ? false : negated;
    if (set) assert.equal(set, 'ForAnyValue');
    return list(actual).some(match);
  }));
}
export function decision(policies, action, resource, context = {}) {
  let allowed = false;
  for (const statement of policies.flatMap(p => p.Statement)) {
    assert.ok(!statement.NotAction && !statement.Principal, 'Unsupported statement semantics');
    const resourceMatch = statement.NotResource ? !list(statement.NotResource).some(r => glob(r, resource)) : list(statement.Resource).some(r => glob(r, resource));
    if (!list(statement.Action).some(a => glob(a, action, true)) || !resourceMatch) continue;
    if (!conditions(statement.Condition, context)) continue;
    if (statement.Effect === 'Deny') return 'explicitDeny';
    assert.equal(statement.Effect, 'Allow');
    allowed = true;
  }
  return allowed ? 'allowed' : 'implicitDeny';
}
export function boundedDecision(policies, boundary, action, resource, context) {
  const identity = decision(policies, action, resource, context);
  const ceiling = decision([boundary], action, resource, context);
  return identity === 'allowed' && ceiling === 'allowed' ? 'allowed' : 'denied';
}
