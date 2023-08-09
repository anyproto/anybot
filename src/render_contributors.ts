// function to render the contributors table and return it as a string
function renderContributors(contributors: any, target: string) {
  let tableContent = '';
  const cellsPerRow = 7;
  for (let r = 0; r < contributors.length/cellsPerRow; r++) {
    let rowContent = '<tr>\n';
    for (let c = 0; c < cellsPerRow && r*cellsPerRow+c < contributors.length; c++) {
      const contributor = contributors[r*cellsPerRow+c];
      const avatar = contributor.avatar;
      const name = contributor.name != null ? contributor.name : contributor.login;
      const link = "http://github.com/" + contributor.login;
      // get the list of unique contribution types
      const contributions = contributor.contributions.map((contribution: any) => contribution.contributionType).filter((value: any, index: any, self: any) => self.indexOf(value) === index);
      // render the html table cell
      rowContent += `<td valign="top" width="${100/cellsPerRow}%"><img src="${avatar}" /><br /><a href="${link}">${name}</a><br />${contributions.join(', ')}</td>\n`;
    }
    rowContent += '</tr>\n';
    tableContent += rowContent;
  }

  // replace the content between the start and end comments with the rendered table
  const startComment = '<!-- CONTRIBUTORS START -->';
  const endComment = '<!-- CONTRIBUTORS END -->';

  return target.replace(new RegExp(startComment + '[\\s\\S]*' + endComment), startComment + '\n<table>\n<tbody>' + tableContent + "</tbody>\n</table>\n" + endComment);
}

export default renderContributors;