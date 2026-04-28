import { Inngest, eventType, staticSchema } from 'inngest';

export const importParseRequested = eventType('import/parse.requested', {
  schema: staticSchema<{ batchId: string; userId: string }>(),
});

export const inngest = new Inngest({ id: 'konto' });
