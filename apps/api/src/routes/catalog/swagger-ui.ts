import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { getAbsoluteFSPath } from 'swagger-ui-dist';

const ASSET_MOUNT = '/v1/_swagger-ui';
const ASSET_ROOT = getAbsoluteFSPath();

// Whitelisted, not path-joined-from-request — the handler below never lets
// a request param choose an arbitrary file off disk.
const ASSETS: Record<string, string> = {
  'swagger-ui.css': 'text/css',
  'swagger-ui-bundle.js': 'application/javascript',
  'swagger-ui-standalone-preset.js': 'application/javascript',
  'favicon-32x32.png': 'image/png',
};

/** Serves the handful of static swagger-ui-dist assets every /docs page needs — mounted once, shared by first- and third-party docs pages. */
export function registerSwaggerUiAssets(server: FastifyInstance): void {
  server.get(`${ASSET_MOUNT}/:file`, async (request, reply) => {
    const { file } = request.params as { file: string };
    const contentType = ASSETS[file];
    if (!contentType) {
      reply.code(404).send();
      return;
    }
    const body = await readFile(path.join(ASSET_ROOT, file));
    reply.header('content-type', contentType).header('cache-control', 'public, max-age=86400').send(body);
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/** A Swagger UI page pointed at `specUrl` — documentation for an API, so it's served from apps/api rather than as a marketplace page in apps/web. */
export function renderSwaggerUiHtml(title: string, specUrl: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="${ASSET_MOUNT}/swagger-ui.css" />
    <link rel="icon" href="${ASSET_MOUNT}/favicon-32x32.png" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${ASSET_MOUNT}/swagger-ui-bundle.js"></script>
    <script src="${ASSET_MOUNT}/swagger-ui-standalone-preset.js"></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({
          url: ${JSON.stringify(specUrl)},
          dom_id: '#swagger-ui',
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          layout: 'StandaloneLayout',
        });
      };
    </script>
  </body>
</html>`;
}
