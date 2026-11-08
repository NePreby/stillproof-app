// Files written by the Go reference's `stillproof embed`; see gen.go.txt.
// Jest runs from the repository root.
const fs = jest.requireActual<{ readFileSync(path: string, encoding?: 'utf8'): Uint8Array & string }>('fs');
const DIR = 'src/protocol/__fixtures__/c2pa/';

export const fixtureBytes = (name: string) => new Uint8Array(fs.readFileSync(DIR + name));
export const fixtureText = (name: string) => fs.readFileSync(DIR + name, 'utf8');
