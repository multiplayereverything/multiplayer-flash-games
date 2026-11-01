export interface Action {
  id: string
  label: string
  description?: string
  link?: string
}

export interface Game {
  id: string
  name: string
  players?: string
  maxPlayers?: number
  online?: { id: string; join?: string }
  categories?: string[]
  color?: string
  colorEnd?: string
  image?: string
  imageFocus?: number
  description?: string
  mod?: { publisher?: string; website?: string; gameName?: string; version?: string }
  site?: string
  actions: Action[]
}

export interface Category {
  id: string
  name: string
  icon: string
  group: string
}

export interface LauncherData {
  branding: { title: string; subtitle: string; theme: string }
  categories: Category[]
  games: Game[]
}
