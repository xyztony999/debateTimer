// Clipboard with a way out. The two-step setup offers "copy" for the key and
// the recovery codes; where the Clipboard API is missing or refuses (insecure
// context, permission denied), the text is selected on screen instead so it
// can be copied by hand. That is not treated as an error.

export const COPY_RESULT = Object.freeze({
    COPIED: 'copied',
    SELECTED: 'selected',
    FAILED: 'failed',
});

/**
 * @param {string} text what to put on the clipboard
 * @param {HTMLElement | null} fallbackEl element whose text is selected when the clipboard cannot be used
 * @returns {Promise<'copied' | 'selected' | 'failed'>}
 */
export async function copyText(text, fallbackEl) {
    try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return COPY_RESULT.COPIED;
        }
    } catch {
        // Fall through to selecting the text.
    }
    if (fallbackEl && typeof document !== 'undefined' && document.createRange) {
        try {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(fallbackEl);
            selection.removeAllRanges();
            selection.addRange(range);
            return COPY_RESULT.SELECTED;
        } catch {
            // Nothing left to try.
        }
    }
    return COPY_RESULT.FAILED;
}
