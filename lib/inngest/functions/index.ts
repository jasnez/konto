import { parseImportFn } from './parse-import';
import { watchdogStuckImportsFn } from './watchdog-stuck-imports';

export const inngestFunctions = [parseImportFn, watchdogStuckImportsFn];
