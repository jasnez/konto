/** JSON.stringify replacer so bigint minor-unit fields serialize safely. */
export function bigintJsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  return value;
}
