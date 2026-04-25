/**
 * ESLint rule: no-unguarded-mutation
 *
 * Flags any Supabase `.update()`, `.delete()`, or `.upsert()` call on a
 * user-owned table (one with a `user_id` column) that does not also chain
 * `.eq('user_id', ...)` somewhere in the same expression.
 *
 * This rule enforces DL-8 from the pre-production audit: the 100+ manual
 * eq('user_id') ownership checks must not be omitted in future code — one
 * missing call is a cross-tenant data leak.
 *
 * Tables with a `user_id` column that are covered by this rule:
 *   transactions, accounts, categories, merchants, merchant_aliases,
 *   import_batches, parsed_transactions, receipt_scans, user_corrections,
 *   installment_plans, rate_limits, categorization_rules, budgets, goals,
 *   recurring_transactions
 *
 * Tables intentionally excluded (no user_id column or different key):
 *   profiles              — uses .eq('id', userId)
 *   installment_occurrences — ownership via parent plan_id
 *   fx_rates              — public read, service-role write only
 *   audit_log             — append-only, user_id SET NULL on delete
 *
 * Mutation methods checked: update, delete, upsert
 * INSERT is excluded — ownership is set via the user_id column in the payload.
 */

/** Tables that have a user_id column and may be mutated by user-facing code. */
const USER_OWNED_TABLES = new Set([
  'transactions',
  'accounts',
  'categories',
  'merchants',
  'merchant_aliases',
  'import_batches',
  'parsed_transactions',
  'receipt_scans',
  'user_corrections',
  'installment_plans',
  'rate_limits',
  'categorization_rules',
  'budgets',
  'goals',
  'recurring_transactions',
]);

const MUTATION_METHODS = new Set(['update', 'delete', 'upsert']);

/**
 * Walk a Supabase call chain downward (via callee.object) and collect:
 *   - tables: table names from .from('...')
 *   - hasMutation: whether update/delete/upsert appears
 *   - hasUserIdEq: whether .eq('user_id', ...) appears anywhere in the chain
 */
function analyzeChain(node) {
  const tables = [];
  let hasMutation = false;
  let hasUserIdEq = false;

  let current = node;
  while (current) {
    if (current.type === 'CallExpression' && current.callee.type === 'MemberExpression') {
      const prop = current.callee.property;
      const methodName = prop.type === 'Identifier' ? prop.name : null;

      if (methodName === 'from') {
        const arg = current.arguments[0];
        if (arg && arg.type === 'Literal' && typeof arg.value === 'string') {
          tables.push(arg.value);
        }
      } else if (methodName && MUTATION_METHODS.has(methodName)) {
        hasMutation = true;
      } else if (methodName === 'eq') {
        const firstArg = current.arguments[0];
        if (firstArg && firstArg.type === 'Literal' && firstArg.value === 'user_id') {
          hasUserIdEq = true;
        }
      }

      current = current.callee.object;
    } else {
      break;
    }
  }

  return { tables, hasMutation, hasUserIdEq };
}

/**
 * Returns true if this CallExpression is the topmost call in a method chain —
 * i.e., no other method is being called on its result.
 *
 * Example: in `supabase.from('x').update({}).eq('user_id', id).single()`
 * only `.single()` returns true; the rest return false because their result
 * is immediately chained.
 */
function isTopOfChain(node) {
  const parent = node.parent;
  if (!parent) return true;
  // If our parent is a MemberExpression and *we* are the object being
  // accessed on, there is another call on top of us → not the top.
  if (parent.type === 'MemberExpression' && parent.object === node) return false;
  return true;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require .eq("user_id", ...) on Supabase update/delete/upsert chains for user-owned tables',
      category: 'Security',
    },
    messages: {
      missingUserIdEq:
        'Supabase {{ method }}() on user-owned table "{{ table }}" must include ' +
        '.eq(\'user_id\', userId) in the same chain. ' +
        'Without it, RLS is the only ownership guard — one missing policy = data leak. ' +
        'Add .eq(\'user_id\', userId) or, if ownership is verified via a related table, ' +
        'add // eslint-disable-next-line local/no-unguarded-mutation -- reason',
    },
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node) {
        // Only analyse the topmost call in a chain to avoid duplicate reports.
        if (!isTopOfChain(node)) return;

        const { tables, hasMutation, hasUserIdEq } = analyzeChain(node);

        if (!hasMutation || hasUserIdEq) return;

        const userOwnedTable = tables.find((t) => USER_OWNED_TABLES.has(t));
        if (!userOwnedTable) return;

        // Find the method name (update/delete/upsert) for the error message.
        let mutationMethod = 'mutation';
        let current = node;
        while (current && current.type === 'CallExpression') {
          if (current.callee.type === 'MemberExpression') {
            const prop = current.callee.property;
            const name = prop.type === 'Identifier' ? prop.name : null;
            if (name && MUTATION_METHODS.has(name)) {
              mutationMethod = name;
              break;
            }
            current = current.callee.object;
          } else {
            break;
          }
        }

        context.report({
          node,
          messageId: 'missingUserIdEq',
          data: { method: mutationMethod, table: userOwnedTable },
        });
      },
    };
  },
};
