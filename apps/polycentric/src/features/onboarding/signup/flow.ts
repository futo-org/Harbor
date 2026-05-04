import { Routes } from '@/src/common/constants/routes';

export const SIGNUP_STEPS = [
  Routes.onboarding.signup.setDisplayName,
  Routes.onboarding.signup.setAbout,
  Routes.onboarding.signup.setAvatar,
  Routes.onboarding.signup.setModeration,
] as const;

export type SignupRoute = (typeof SIGNUP_STEPS)[number];

export function getNextStep(currentPath: string): SignupRoute | null {
  const currentIndex = SIGNUP_STEPS.indexOf(currentPath as SignupRoute);
  if (currentIndex === -1 || currentIndex === SIGNUP_STEPS.length - 1) {
    return null;
  }
  return SIGNUP_STEPS[currentIndex + 1];
}

export function isLastStep(currentPath: string): boolean {
  return currentPath === SIGNUP_STEPS[SIGNUP_STEPS.length - 1];
}
