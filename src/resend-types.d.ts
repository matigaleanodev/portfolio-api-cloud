// El SDK declara HeadersInit global; Node expone ese tipo mediante RequestInit.
declare global {
  type HeadersInit = NonNullable<RequestInit["headers"]>;
}

export {};
