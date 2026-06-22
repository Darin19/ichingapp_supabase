import { useEffect, useMemo, useRef } from "react";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CodeToggle,
  CreateLink,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  type MDXEditorMethods,
  quotePlugin,
  Separator,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
} from "@mdxeditor/editor";

type CanvasNoteEditorProps = {
  markdown: string;
  readOnly: boolean;
  onChange: (markdown: string) => void;
};

export default function CanvasNoteEditor({
  markdown,
  readOnly,
  onChange,
}: CanvasNoteEditorProps) {
  const editorRef = useRef<MDXEditorMethods>(null);

  const plugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      markdownShortcutPlugin(),
      toolbarPlugin({
        toolbarContents: () => (
          <>
            <UndoRedo />
            <Separator />
            <BlockTypeSelect />
            <Separator />
            <BoldItalicUnderlineToggles />
            <CodeToggle />
            <Separator />
            <ListsToggle options={["bullet", "number"]} />
            <Separator />
            <CreateLink />
          </>
        ),
      }),
    ],
    [readOnly],
  );

  useEffect(() => {
    if (editorRef.current?.getMarkdown() !== markdown) {
      editorRef.current?.setMarkdown(markdown);
    }
  }, [markdown]);

  return (
    <MDXEditor
      ref={editorRef}
      markdown={markdown}
      readOnly={readOnly}
      onChange={onChange}
      placeholder="Write canvas notes..."
      spellCheck
      plugins={plugins}
      className={`canvas-note-editor ${
        readOnly ? "canvas-note-editor-readonly" : "canvas-note-editor-editing"
      }`}
      contentEditableClassName="canvas-note-editor-content"
    />
  );
}
