const fs = require('fs');

// Read all chunks from stdin
let inputChunks = [];
process.stdin.on('data', chunk => {
    inputChunks.push(chunk);
});

process.stdin.on('end', () => {
    const inputData = Buffer.concat(inputChunks).toString();
    if (!inputData) process.exit(0);

    try {
        const payload = JSON.parse(inputData);

        // We are hooking into PostToolUse
        const toolName = payload.tool;
        const result = payload.result;

        if (toolName === "my_bash_tool") {
            // Mutate the result
            const modifiedResult = result + "\n[Appended by Node.js PostToolUse Hook!]";

            console.log(JSON.stringify({
                result: modifiedResult
            }));
            process.exit(0);
        }

        console.log("{}");
    } catch (err) {
        console.error(JSON.stringify({ error: err.message }));
        process.exit(1);
    }
});
