// Register-mode copy selection for LoginPage.
//
// "The first account becomes the administrator" only holds on a fresh
// deployment with zero users. It used to be keyed as the generic register
// title, so every public registrant was told they were creating an admin
// account. Keep the two wordings on separate keys and choose by user count.

export function registerCopyKeys(hasUsers) {
    if (hasUsers) {
        return { titleKey: 'auth.registerTitle', subtitleKey: 'auth.registerSubtitle' };
    }
    return { titleKey: 'auth.firstUserTitle', subtitleKey: 'auth.firstUserSubtitle' };
}
