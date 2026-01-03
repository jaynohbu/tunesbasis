// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000',
  syncServerUrl: 'http://localhost:3001',
  cognitoUserPoolId: 'us-west-2_i3IgdwzmB',
  cognitoClientId: '306jragtl0hl7d1m82bohbms88',
  cognitoRegion: 'us-west-2',
  graphqlEndpoint: 'https://veziy6ixvvf67awuwi2dybtmlu.appsync-api.us-west-2.amazonaws.com/graphql'
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
