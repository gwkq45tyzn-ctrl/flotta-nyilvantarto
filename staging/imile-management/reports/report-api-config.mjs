/**
 * A production-approved API URL must be configured explicitly before a
 * read/write server migration. Empty means NO cloud report writes.
 * Never insert a service account, bearer token or API key in this file.
 */
export const reportApiBaseUrl='';
export const reportApiReady=typeof reportApiBaseUrl==='string'&&
 /^https:\/\/[a-zA-Z0-9.-]+(?::[0-9]{2,5})?$/.test(reportApiBaseUrl)&&
 !reportApiBaseUrl.includes('localhost');
