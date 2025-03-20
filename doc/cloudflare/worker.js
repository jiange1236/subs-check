const MIRROR_URL = 'https://christianai.pages.dev';

const createResponse = (data, status = 200, contentType = 'application/json') => {
    const body = contentType === 'application/json' ? JSON.stringify(data) : data;
    return new Response(body, {
        status,
        headers: {
            'Content-Type': `${contentType}; charset=utf-8`,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
    });
};

const handleError = (message, status = 500) => {
    return createResponse({ code: status, message }, status);
};

const routeHandlers = {

    async github(request, url) {
        try {
            const githubPath = url.pathname.replace('/github/', '');
            const githubUrl = `https://api.github.com/${githubPath}`;
            const headers = new Headers(request.headers);
            headers.set('User-Agent', 'Cloudflare-Worker');

            const githubResponse = await fetch(githubUrl, {
                method: request.method,
                headers,
                body: request.method !== 'GET' ? await request.text() : undefined
            });

            return new Response(await githubResponse.text(), {
                status: githubResponse.status,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                    'Content-Type': 'application/json'
                }
            });
        } catch (error) {
            return handleError('GitHub API 请求失败: ' + error.message);
        }
    },

    async gist(request, url, env) {
        if (!await validateToken(url, env)) {
            return handleError('未授权访问', 401);
        }

        try {
            const key = url.searchParams.get('key');
            const timestamp = Date.now();
            const gistUrl = `https://gist.githubusercontent.com/${env.GITHUB_USER}/${env.GITHUB_ID}/raw/${key}?timestamp=${timestamp}`;
            const gistContent = await fetch(gistUrl).then(res => res.text());
            return createResponse(gistContent, 200, 'text/plain');
        } catch (error) {
            return handleError('获取 Gist 内容失败: ' + error.message);
        }
    },

    async storage(request, url, env) {
        if (!await validateToken(url, env)) {
            return handleError('未授权访问', 401);
        }

        if (request.method === 'GET') {
            const filename = url.searchParams.get('filename');
            if (!filename) {
                return handleError('请提供文件名', 400);
            }

            try {
                const object = await env.SUB_BUCKET.get(filename);
                if (object === null) {
                    return handleError('未找到该键对应的值', 404);
                }
                return createResponse(await object.text(), 200, 'text/plain');
            } catch (error) {
                return handleError('读取数据失败: ' + error.message);
            }
        } else if (request.method === 'POST') {
            try {
                const { filename, value } = await request.json();
                if (!filename || !value) {
                    return handleError('请提供文件名和值', 400);
                }

                await env.SUB_BUCKET.put(filename, value);
                return createResponse({ code: 200, message: '数据写入成功' });
            } catch (error) {
                return handleError('数据写入失败: ' + error.message);
            }
        }

        return handleError('不支持的请求方法', 405);
    },
    async speedtest(request, url, env) {
        try {
            const bytes = url.searchParams.get('bytes');
            if (!bytes) {
                return handleError('请提供测试大小(bytes)', 400);
            }

            const speedTestUrl = `https://speed.cloudflare.com/__down?bytes=${bytes}`;
            const response = await fetch(speedTestUrl, {
                method: request.method,
                headers: request.headers
            });

            return new Response(response.body, {
                status: response.status,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Content-Type': 'application/octet-stream'
                }
            });
        } catch (error) {
            return handleError('测速失败: ' + error.message);
        }
    }
};

async function validateToken(url, env) {
    const token = url.searchParams.get('token');
    return token === env.AUTH_TOKEN;
}

async function handleMirrorRequest(request, url) {
    try {
        const clockieUrl = new URL(url.pathname + url.search, MIRROR_URL);
        const response = await fetch(clockieUrl.toString(), {
            method: request.method,
            headers: request.headers,
            body: request.method !== 'GET' ? await request.clone().text() : undefined
        });

        const responseHeaders = new Headers(response.headers);
        responseHeaders.set('Access-Control-Allow-Origin', '*');

        return new Response(await response.text(), {
            status: response.status,
            headers: responseHeaders
        });
    } catch (error) {
        return handleError('镜像请求失败: ' + error.message);
    }
}

export default {
    async fetch(request, env) {
        try {
            const url = new URL(request.url);
            const pathname = url.pathname;

            const routes = {
                '/github/': () => routeHandlers.github(request, url),
                '/gist': () => routeHandlers.gist(request, url, env),
                '/storage': () => routeHandlers.storage(request, url, env),
                '/speedtest': () => routeHandlers.speedtest(request, url, env)
            };

            for (const [route, handler] of Object.entries(routes)) {
                if (pathname === route || pathname.startsWith(route)) {
                    return await handler();
                }
            }

            return await handleMirrorRequest(request, url);
        } catch (error) {
            return handleError('服务器错误: ' + error.message);
        }
    }
};