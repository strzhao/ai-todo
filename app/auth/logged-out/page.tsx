import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoggedOutPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">AI Todo</CardTitle>
          <CardDescription>已退出登录</CardDescription>
        </CardHeader>
        <CardContent>
          {/* form GET 是纯浏览器导航，Next.js 不会拦截为 RSC fetch，
              避免 proxy 的 307 redirect 到 auth server 触发 CORS 错误 */}
          <form action="/api/auth/relogin" method="get">
            <Button type="submit" className="w-full">重新登录</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
