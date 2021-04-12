# RunnableFuture

```java
    // 继承了 Runnable，Future同时拥有线程，返回任务结果的能力
    public interface RunnableFuture<V> extends Runnable, Future<V> {
        /**
         * Sets this Future to the result of its computation
         * unless it has been cancelled.
         */
        void run();
    }
```
