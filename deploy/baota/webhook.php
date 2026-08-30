<?php
/**
 * GitHub webhook → 触发 deploy.sh。
 *
 * 不要放进前端网站根目录。复制到独立站点或 API 站点的受保护路径，例如：
 *   https://api.debatetimer.tonyxyz.com/baota-deploy-hook.php
 *
 * GitHub → Settings → Webhooks：
 *   Payload URL: 上面的地址
 *   Content type: application/json
 *   Secret: 与 deploy.env 里 WEBHOOK_SECRET 相同
 *   事件: Just the push event
 *
 * PHP 进程需要有权限执行 deploy.sh（root 的计划任务 / GitHub Actions SSH 更稳）。
 */
header('Content-Type: text/plain; charset=utf-8');

$scriptDir = __DIR__;
$envFile = $scriptDir . '/deploy.env';
$secret = getenv('WEBHOOK_SECRET') ?: '';
$branch = getenv('GIT_BRANCH') ?: 'master';
$deployScript = $scriptDir . '/deploy.sh';

if (is_readable($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || (isset($line[0]) && $line[0] === '#')) {
            continue;
        }
        if (strpos($line, 'WEBHOOK_SECRET=') === 0) {
            $secret = trim(substr($line, strlen('WEBHOOK_SECRET=')), " \t\"'");
        }
        if (strpos($line, 'GIT_BRANCH=') === 0) {
            $branch = trim(substr($line, strlen('GIT_BRANCH=')), " \t\"'");
        }
    }
}

if ($secret === '') {
    http_response_code(500);
    echo "WEBHOOK_SECRET is not configured\n";
    exit;
}

$payload = file_get_contents('php://input');
$sig = $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '';
$expected = 'sha256=' . hash_hmac('sha256', $payload, $secret);

if (!hash_equals($expected, $sig)) {
    http_response_code(403);
    echo "invalid signature\n";
    exit;
}

$event = $_SERVER['HTTP_X_GITHUB_EVENT'] ?? '';
if ($event === 'ping') {
    echo "pong\n";
    exit;
}
if ($event !== 'push') {
    http_response_code(204);
    exit;
}

$data = json_decode($payload, true);
$ref = $data['ref'] ?? '';
$wanted = 'refs/heads/' . $branch;
if ($ref !== $wanted && $ref !== 'refs/heads/main') {
    echo "ignored ref {$ref}\n";
    exit;
}

$log = '/www/wwwlogs/debatetimer-webhook.log';
$cmd = 'bash ' . escapeshellarg($deployScript) . ' >> ' . escapeshellarg($log) . ' 2>&1 &';
exec($cmd);
echo "deploy started\n";
