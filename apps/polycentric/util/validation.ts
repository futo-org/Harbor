const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;

/*
 * Validates a username
 * @param username - The username to validate
 * @returns An error message if the username is invalid, otherwise null
 */
export const validateUsername = (username: string): string | null => {
  if (username.length < USERNAME_MIN_LENGTH) {
    return `Username must be at least ${USERNAME_MIN_LENGTH} characters`;
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return `Username must be ${USERNAME_MAX_LENGTH} characters or less`;
  }
  if (!USERNAME_REGEX.test(username)) {
    return 'Username can only contain letters, numbers, and underscores';
  }
  return null;
};
