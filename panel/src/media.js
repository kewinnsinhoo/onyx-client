// Archivos subidos guardados en KV (de una vez, o en trozos de 20 MB los grandes).

// Borra un archivo subido (de una vez o en trozos)
export async function deleteMediaKeys(env, id) {
  await env.MEDIA.delete(`m:${id}`);
  const raw = await env.MEDIA.get(`m:${id}:meta`);
  if (!raw) return;
  const meta = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
  for (let n = 0; n < meta.parts; n++) await env.MEDIA.delete(`m:${id}:${n}`);
  await env.MEDIA.delete(`m:${id}:meta`);
}
