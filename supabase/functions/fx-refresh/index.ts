declare global {
  interface DenoLike {
    serve?: (handler: (request: Request) => Response | Promise<Response>) => void;
  }
}

const denoRuntime = (globalThis as { Deno?: DenoLike }).Deno;

function handleFxRefresh(): Response {
  // TODO(F1-E3-T1): Implement daily EUR/* FX refresh and cache write into public.fx_rates.
  return new Response(
    JSON.stringify({
      ok: true,
      message: 'fx-refresh scaffold is in place',
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
}

if (denoRuntime?.serve) {
  denoRuntime.serve(() => handleFxRefresh());
}

export { handleFxRefresh };
