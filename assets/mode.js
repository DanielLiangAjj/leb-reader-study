// Test mode, for the study team to try the page: the link carries &test=1 (for example ?r=1&test=1).
// In test mode nothing is sent to the database, what is filled in is kept apart from a real session in the
// same browser, and a trial or a whole part can be skipped. A reader's link never carries the parameter.
export const TEST = new URLSearchParams(window.location.search).has('test');
