/** Why a name can't be used: a list's or Trade list's file name, or a Version's. */
export const names = {
  file: {
    empty: 'Name cannot be empty.',
    tooLong: (max: number) => `Name is too long (max ${max} characters).`,
    forbidden: 'Name cannot contain < > : " / \\ | ? *',
    endsWithDot: 'Name cannot end with a dot or space.',
    reserved: (name: string) => `"${name}" is a reserved name on Windows.`
  },
  version: {
    empty: 'Name the Version.',
    tooLong: (max: number) => `At most ${max} characters.`,
    characters: "Use letters, numbers, spaces, &, +, ' and -.",
    endsInOut: 'A name can\'t end in “in” or “out”.',
    taken: 'That name is taken.'
  },
  /** A list made from a precon whose name leaves nothing usable. */
  defaultPrecon: 'Precon',
  /** A friend's Trade list whose name leaves nothing usable. */
  defaultFriend: 'Friend'
}
