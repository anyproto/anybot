function linksToIssue(comment: any) {
  return (
    comment?.includes("fix") ||
    comment?.includes("fixes") ||
    comment?.includes("fixed") ||
    comment?.includes("close") ||
    comment?.includes("closes") ||
    comment?.includes("closed") ||
    comment?.includes("resolve") ||
    comment?.includes("resolves") ||
    (comment?.includes("resolved") && comment?.includes("#"))
  );
}

export default linksToIssue;
