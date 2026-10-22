import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const TAG = '[Constants]';

const jsonPath = join(process.cwd(), 'constants.json');
let json: any;

try {
    json = JSON.parse(readFileSync(jsonPath, 'utf-8'));
} catch (err) {
    console.log(TAG, `Não foi possível encontrar o constants.json em: ${jsonPath}`);
    process.exit(1);
}

interface EmojiStructure {
    static: Record<string, string>;
    animated: Record<string, string>;
}

interface Constants {
    colors?: Record<string, string>;
    emojis: EmojiStructure;
}

function formatStatic(id: string): string {
    return `<:emoji:${id}>`;
}

function formatAnimated(id: string): string {
    return `<a:emoji:${id}>`;
}

function processEmojis(emojis: EmojiStructure) {
    const formattedStatic = Object.fromEntries(
        Object.entries(emojis.static).map(([key, value]) => [key, formatStatic(value)])
    );

    const formattedAnimated = Object.fromEntries(
        Object.entries(emojis.animated).map(([key, value]) => [key, formatAnimated(value)])
    );

    return {
        static: formattedStatic,
        animated: formattedAnimated
    };
}

function validateEmojis(emojis: any): asserts emojis is EmojiStructure {
    if (typeof emojis !== 'object' || emojis === null) {
        throw new Error(`Type Error: "emojis" must be an OBJECT.`);
    }

    if (!emojis.static || typeof emojis.static !== 'object') {
        throw new Error(`Type Error: "emojis.static" must be an OBJECT.`);
    }

    if (!emojis.animated || typeof emojis.animated !== 'object') {
        throw new Error(`Type Error: "emojis.animated" must be an OBJECT.`);
    }

    for (const [key, value] of Object.entries(emojis.static)) {
        if (typeof value !== 'string') {
            throw new Error(`Type Error: emojis.static.${key} must be STRING.`);
        }
        if (!/^\d+$/.test(value)) {
            throw new Error(`Type Error: emojis.static.${key} must be a valid emoji ID.`);
        }
    }

    for (const [key, value] of Object.entries(emojis.animated)) {
        if (typeof value !== 'string') {
            throw new Error(`Type Error: emojis.animated.${key} must be STRING.`);
        }
        if (!/^\d+$/.test(value)) {
            throw new Error(`Type Error: emojis.animated.${key} must be a valid emoji ID.`);
        }
    }
}

function validateColors(colors: any): asserts colors is Record<string, string> {
    if (typeof colors !== 'object' || colors === null || Array.isArray(colors)) {
        throw new Error('Type Error: "colors" must be an OBJECT.');
    }

    for (const [key, value] of Object.entries(colors)) {
        if (typeof value !== 'string' || !value.startsWith('0x')) {
            throw new Error(`Type Error: Color "${key}" must be a HEX string starting with "0x".`);
        }
    }
}

function validateConstants(data: any): asserts data is Constants {
    if (typeof data !== 'object' || data === null) {
        throw new Error('Fatal Error: constants.json must be an OBJECT.');
    }

    if (data.colors !== undefined) {
        validateColors(data.colors);
    }

    if (!data.emojis) {
        throw new Error('Fatal Error: "emojis" property not found in constants.json.');
    }

    validateEmojis(data.emojis);
}

try {
    validateConstants(json);

    const processedConstants = {
        ...json,
        colors: Object.fromEntries(
            Object.entries(json.colors ?? {}).map(([key, val]) => [key, Number(val)])
        ),
        emojis: processEmojis(json.emojis)
    };

    Object.assign(globalThis, {
        constants: Object.freeze(processedConstants)
    });

    console.log(TAG, 'Constants successfully validated and converted.');
} catch (error) {
    console.log(TAG, error instanceof Error ? error.message : error);
    process.exit(1);
}

declare global {
    var constants: {
        colors: Record<string, number>;
        emojis: {
            static: Record<string, string>;
            animated: Record<string, string>;
        };
    };
}
