
The system will:

- browser based javascript and static files only, to the extent possible
- Authenticate users using Frontier OAuth2 with PKCE. Question: can this be done browser only or does it require proxy in server?
- Retrieve fleet carrier data from CAPI
- Store user and historical data available from capi. credits, cargo, market etc
- store in browser indexeddb and localstorage
- import and export data as files
- support multiple cmdr carriers simultaneously, keeping data separate
- rate limit CAPI requests to 1 per 15 minutes per cmdr
- simple and straight forward UI at first, extend and refine later
