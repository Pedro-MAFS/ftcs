package com.mfs.tokengateway.server.upstream;

/**
 * 流式结束钩子（US-G0-04 默认打日志；US-G0-10 实现扣费）。
 */
public interface StreamFinishListener {

    void onFinished(StreamFinishContext context);
}
