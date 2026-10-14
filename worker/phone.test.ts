import { describe, expect, it } from 'vitest';
import { maskNumber, toPhoneCall, tokenMatches } from './phone';

const payload = (vars: Record<string, unknown>) => ({
  app_id: 'a',
  app_version: 1,
  deployment_id: 'd',
  interaction_id: '20261014/abc',
  user_phone_number: '+919876504148',
  agent_phone_number: '+917965854148',
  end_datetime: '2026-10-14T13:00:00Z',
  final_agent_variables: vars,
  interaction_transcript: [],
});

describe('phone line', () => {
  it('masks caller numbers', () => {
    expect(maskNumber('+919876504148')).toBe('+91 ••••• 4148');
    expect(maskNumber(undefined)).toBe('Caller');
  });

  it('turns a call-end webhook into an on-air call', () => {
    const call = toPhoneCall(
      payload({ caller_name: 'Priya', caller_city: 'Vadodara', request_type: 'dedication', on_air_message: 'मम्मी को जन्मदिन मुबारक!', on_air_ok: 'yes' }),
    );
    expect(call).toMatchObject({ name: 'Priya', city: 'Vadodara', type: 'dedication', maskedNumber: '+91 ••••• 4148' });
    expect(call?.message).toBe('मम्मी को जन्मदिन मुबारक!');
  });

  it('keeps nothing when the caller declines or leaves no message', () => {
    expect(toPhoneCall(payload({ on_air_message: 'hello', on_air_ok: false }))).toBeNull();
    expect(toPhoneCall(payload({ request_type: 'chat' }))).toBeNull();
    expect(toPhoneCall({ nope: true })).toBeNull();
  });

  it('keeps the story theme only for story requests', () => {
    const call = toPhoneCall(payload({ request_type: 'story_request', on_air_message: 'एक भूतिया कहानी!', story_theme: 'ghost story' }));
    expect(call?.theme).toBe('ghost story');
  });

  it('compares webhook tokens exactly', () => {
    expect(tokenMatches('abc123', 'abc123')).toBe(true);
    expect(tokenMatches('abc124', 'abc123')).toBe(false);
    expect(tokenMatches(undefined, 'abc123')).toBe(false);
  });
});
