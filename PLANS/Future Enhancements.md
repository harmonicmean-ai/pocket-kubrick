# Future Enhancements

## Ideas

*   Wouldn't it be cool if the transcript had the start time for each scene?


## Annoyances

*   The console (stdout) output of the `build` command writes out fully-qualified for some but not all output files. For instance, we need to make the full audio output path fully-qualified, and scan for other such occurrences.
*   When an absolute project path is defined in .env, the `init` command puts the generated files in the wrong place (a relative path).
*   When re-building a video where the scene count has changed, build fails and you have to delete some of the generated (runtime) files.
*   Not sure why videos can seemingly only be generated at 30fps. (Granted, my testing was limited.)
*   In the compose tool, pressing C to activate the circle tool is great, but not when it is also triggered by `ctrl+c` to copy. This probably extends to other keystrokes.
*   The preview tool doesn't display custom fonts. // TESTME: this may no longer be true after early May enhancements