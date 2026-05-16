export async function getStaticPaths() {
  return [{ id: "tokyo-1" }, { id: "osaka-2" }];
}

export default function PropertyPage(ctx: { params: { id: string } }) {
  return <h1>Property: {ctx.params.id}</h1>;
}
