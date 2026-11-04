import { createServer } from "http";
/** Parse request body as JSON. Returns null on empty or invalid. */
async function readBody(req) {
    return new Promise((resolve) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8").trim();
            if (!raw) {
                resolve(null);
                return;
            }
            try {
                resolve(JSON.parse(raw));
            }
            catch {
                resolve(null);
            }
        });
        req.on("error", () => resolve(null));
    });
}
/** Match URL against a route pattern. Returns params map or null. */
function matchRoute(url, pattern) {
    const urlParts = url.split("/").filter(Boolean);
    const patternParts = pattern.split("/").filter(Boolean);
    if (urlParts.length !== patternParts.length)
        return null;
    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
        const p = patternParts[i];
        if (p.startsWith(":"))
            params[p.slice(1)] = decodeURIComponent(urlParts[i]);
        else if (p !== urlParts[i])
            return null;
    }
    return params;
}
/** Send a JSON response. */
export function send(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
    });
    res.end(payload);
}
export function startServer(routes, port, serviceName, cleanup) {
    const server = createServer(async (req, res) => {
        const method = req.method ?? "GET";
        const rawUrl = req.url ?? "/";
        const url = rawUrl.split("?")[0];
        for (const route of routes) {
            if (route.method !== method)
                continue;
            const params = matchRoute(url, route.pattern);
            if (params === null)
                continue;
            const body = (method !== "GET" && method !== "DELETE")
                ? await readBody(req)
                : null;
            try {
                await route.handler(req, res, body, params);
            }
            catch (err) {
                console.error(`[${serviceName}] unhandled error:`, err);
                if (!res.headersSent) {
                    send(res, 500, { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
                }
            }
            return;
        }
        send(res, 404, { success: false, error: { code: "NOT_FOUND", message: `${method} ${url} not found` } });
    });
    server.listen(port, () => {
        console.log(`[${serviceName}] listening on port ${port}`);
    });
    const shutdown = async (signal) => {
        console.log(`[${serviceName}] ${signal} received, shutting down...`);
        server.close(async () => {
            if (cleanup)
                await cleanup();
            console.log(`[${serviceName}] shutdown complete`);
            process.exit(0);
        });
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
}
