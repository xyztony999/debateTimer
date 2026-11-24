import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { privacyService } from '../../services/privacyService';
import { noticeLanguage } from '../../utils/authFlow';

export const NOTICE_STATUS = Object.freeze({
    IDLE: 'idle',
    LOADING: 'loading',
    READY: 'ready',
    ERROR: 'error',
});

const INITIAL = { status: NOTICE_STATUS.IDLE, notice: null, lng: null };

/**
 * Loads the privacy notice in the interface language.
 *
 * With `autoLoad` the notice is fetched as soon as the caller mounts (the
 * sign-up form, which cannot accept consent before the text is on screen).
 * Otherwise nothing is requested until `open()` — the sign-in page only
 * fetches it when the visitor asks to see it.
 *
 * Once a notice has been requested, switching the interface language fetches
 * it again in the new language and the status goes back to "loading" for the
 * duration, so a consent button built on it is disabled in the meantime.
 */
export function usePrivacyNotice({ autoLoad = false } = {}) {
    const { i18n } = useTranslation();
    const lng = noticeLanguage(i18n.language);
    const [state, setState] = useState(INITIAL);
    const requestedRef = useRef(autoLoad);
    const requestSeqRef = useRef(0);

    // (Re)fetches in the current language. A response that arrives after a
    // newer request was made is dropped, so a slow answer in the old language
    // can never overwrite the one just requested.
    const load = useCallback(async () => {
        requestedRef.current = true;
        const seq = ++requestSeqRef.current;
        setState((prev) => ({ ...prev, lng, status: NOTICE_STATUS.LOADING }));
        const result = await privacyService.getNotice(lng);
        if (seq !== requestSeqRef.current) {
            return result;
        }
        setState({
            lng,
            status: result.success ? NOTICE_STATUS.READY : NOTICE_STATUS.ERROR,
            notice: result.success ? result.data : null,
        });
        return result;
    }, [lng]);

    useEffect(() => {
        if (requestedRef.current) {
            load();
        }
    }, [lng, autoLoad, load]);

    // Shows the notice; fetches it first when it has not been read yet or the
    // last read failed. An already loaded notice is reused as is.
    const open = useCallback(() => {
        if (state.status !== NOTICE_STATUS.READY && state.status !== NOTICE_STATUS.LOADING) {
            return load();
        }
        return Promise.resolve(null);
    }, [load, state.status]);

    return { ...state, lng, load, open };
}
