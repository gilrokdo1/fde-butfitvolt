export interface User {
  user_id: number;
  username: string;
  name: string;
  app_type: string;
}

export interface MenuItem {
  name: string;
  path?: string;
  image?: string;
  team?: string;
  children?: { name: string; path: string }[];
}
