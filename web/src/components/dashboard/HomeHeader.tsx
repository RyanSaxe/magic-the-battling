import { AppHeader, HomeButton, UserMenuButton } from "../common/AppHeader";

/** The app header for pages reached from the dashboard: Home, then the account menu. */
export function HomeHeader() {
  return (
    <AppHeader
      home={<HomeButton to="/dashboard" />}
      account={<UserMenuButton />}
    />
  );
}
