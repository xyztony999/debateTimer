/**
 * D37 (PageSpec §20): dedicated-worker heartbeat. Window timers in a
 * backgrounded tab are throttled to ~1/min by the browser, which used to
 * freeze (and via per-beat rounding, drift) the local clock whether the page
 * was the host console or a display. Worker timers are exempt from tab
 * throttling, so the 250ms cadence keeps both ends ticking at truth.
 */
let timer = null;

self.onmessage = (e) => {
    if (e.data === 'start' && timer === null) {
        timer = setInterval(() => self.postMessage('tick'), 250);
    } else if (e.data === 'stop' && timer !== null) {
        clearInterval(timer);
        timer = null;
    }
};
