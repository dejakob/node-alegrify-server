# Alegrify Server

Node JS server app for Alegrify.com
The `alegrify-web` module used to be the front end and was a dependency for the server.
This way, the server could prerender the page server side on initial page load.

## Automated testing

Automated tests in this project are end to end and use Puppeteer to test certain functionality.
Check out the [__tests__](./__tests__) folder to see all the end to end tests.
Bitrise was used as a CI tool and ran end2end tests on each push to the `develop` branch.
If tests succeeded, `develop` would be merged into `master` and `master` would get deployed on the RC server.

## Isomorphic state