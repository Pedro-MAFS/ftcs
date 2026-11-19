declare module 'html-to-text' {
  export function compile(options: {wordwrap: false; selectors: {selector:string; format:'skip'}[]}): (html:string) => string
}
