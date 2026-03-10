import { describe, it, expect } from 'vitest';
import { WrapperError, InvalidKeyLengthError } from '@polycentric/js-core';

describe('Error Classes', () => {
  describe('WrapperError', () => {
    it('should create a WrapperError with correct properties', () => {
      const message = 'Test wrapper error';
      const error = new WrapperError(message);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(WrapperError);
      expect(error.message).toBe(message);
      expect(error.name).toBe('WrapperError');
    });

    it('should maintain proper prototype chain', () => {
      const error = new WrapperError('test');
      expect(error instanceof WrapperError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('Custom errors class', () => {
    it('should create an InvalidKeyLengthError with correct properties', () => {
      const message = 'Invalid key length';
      const error = new InvalidKeyLengthError(message);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(WrapperError);
      expect(error).toBeInstanceOf(InvalidKeyLengthError);
      expect(error.message).toBe(message);
      expect(error.name).toBe('InvalidKeyLengthError');
    });
  });

  describe('Error inheritance chain', () => {
    it('should catch custom errors with WrapperError and Error', () => {
      const errors = [new InvalidKeyLengthError('test')];

      errors.forEach((error) => {
        expect(error instanceof WrapperError).toBe(true);
        expect(error instanceof Error).toBe(true);
      });
    });
  });
});
