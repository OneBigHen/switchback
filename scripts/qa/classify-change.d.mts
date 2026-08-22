export type ChangeFile = string | {
  path: string
  additions?: number
  deletions?: number
}

export declare function classifyChange(files?: ChangeFile[]):
  | "docs"
  | "low"
  | "standard"
  | "ui"
  | "routing"
  | "offline"
  | "security"
  | "architecture"
