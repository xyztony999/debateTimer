import { Router } from 'express';

/**
 * C-02 pairing: the phone types the 4-digit code shown next to the host's
 * "远程控制" chip to attach as its remote. Owner-scoped — a code only ever
 * matches the typist's own live sessions.
 */
export function createPairingRouter({ timerSessions, requireAuth }) {
    const router = Router();

    router.post('/pair', requireAuth, async (req, res) => {
        try {
            const session = timerSessions.pairByCode(req.user.id, req.body?.code);
            if (!session) {
                res.status(404).json({
                    success: false,
                    message: '未找到匹配的远程控制会话',
                });
                return;
            }
            res.json({
                success: true,
                data: {
                    configName: session.configName,
                    shareToken: session.shareToken,
                },
            });
        } catch (error) {
            console.error('POST /api/session/pair', error.message);
            res.status(error.status || 500).json({
                success: false,
                message: error.message || 'Pairing failed',
            });
        }
    });

    return router;
}
