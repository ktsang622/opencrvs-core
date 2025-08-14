import * as Hapi from '@hapi/hapi'

declare module '@hapi/hapi' {
  interface ResponseToolkit {
    proxy(options: { uri: string; passThrough?: boolean }): any
  }
}