export const APP_USERNAME = "yetiandi";
export const APP_LOGIN_EMAIL = "yetiandi@iching.local";

export const normalizeUsername = (username: string) =>
  username.trim().toLowerCase();

export const isValidLoginIdentifier = (identifier: string) => {
  const normalizedIdentifier = normalizeUsername(identifier);
  return (
    normalizedIdentifier === APP_USERNAME ||
    normalizedIdentifier === APP_LOGIN_EMAIL
  );
};

export const isAuthorizedAppEmail = (email?: string | null) =>
  email?.toLowerCase() === APP_LOGIN_EMAIL;
