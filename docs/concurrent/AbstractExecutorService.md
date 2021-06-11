# AbstractExecutorService

AbstractExecutorService 实现了 ExecutorService 和 Executor 接口的基本方法，
ThreadPoolExecute 和 ForkJoinPool 继承 AbstractExecutorService 就可以减少实现的复杂度，接口适配器模式

```java

    public abstract class AbstractExecutorService implements ExecutorService {

        /**
         * Returns a {@code RunnableFuture} for the given runnable and default
         * value.
         *
         * @param runnable the runnable task being wrapped
         * @param value the default value for the returned future
         * @param <T> the type of the given value
         * @return a {@code RunnableFuture} which, when run, will run the
         * underlying runnable and which, as a {@code Future}, will yield
         * the given value as its result and provide for cancellation of
         * the underlying task
         * @since 1.6
         */
        // 将 runnable封装成 FutureTask并且提供结果值 value
        protected <T> RunnableFuture<T> newTaskFor(Runnable runnable, T value) {
            return new FutureTask<T>(runnable, value);
        }

        /**
         * Returns a {@code RunnableFuture} for the given callable task.
         *
         * @param callable the callable task being wrapped
         * @param <T> the type of the callable's result
         * @return a {@code RunnableFuture} which, when run, will call the
         * underlying callable and which, as a {@code Future}, will yield
         * the callable's result as its result and provide for
         * cancellation of the underlying task
         * @since 1.6
         */
        // 将Callable封装成FutureTask
        protected <T> RunnableFuture<T> newTaskFor(Callable<T> callable) {
            return new FutureTask<T>(callable);
        }

        /**
         * @throws RejectedExecutionException {@inheritDoc}
         * @throws NullPointerException       {@inheritDoc}
         */
        // 提交 Runnable任务，返回 Future
        public Future<?> submit(Runnable task) {
            if (task == null) throw new NullPointerException();
            RunnableFuture<Void> ftask = newTaskFor(task, null);
            execute(ftask);
            return ftask;
        }

        /**
         * @throws RejectedExecutionException {@inheritDoc}
         * @throws NullPointerException       {@inheritDoc}
         */
        // 提交 Runnable任务，并且提供默认值，返回 Future
        public <T> Future<T> submit(Runnable task, T result) {
            if (task == null) throw new NullPointerException();
            RunnableFuture<T> ftask = newTaskFor(task, result);
            execute(ftask);
            return ftask;
        }

        /**
         * @throws RejectedExecutionException {@inheritDoc}
         * @throws NullPointerException       {@inheritDoc}
         */
        // 提交 Callable 任务，返回 Future
        public <T> Future<T> submit(Callable<T> task) {
            if (task == null) throw new NullPointerException();
            RunnableFuture<T> ftask = newTaskFor(task);
            execute(ftask);
            return ftask;
        }

        /**
         * invokeAny的主要实现
         * timed: [true]代表是否超有时限制
         * nanos: 超时纳秒数
         * the main mechanics of invokeAny.
         */
        private <T> T doInvokeAny(Collection<? extends Callable<T>> tasks,
                                  boolean timed, long nanos)
            throws InterruptedException, ExecutionException, TimeoutException {
            // 检查tasks任务集合是不是为null
            if (tasks == null)
                // 抛出空指针异常
                throw new NullPointerException();
            // 获取任务集合的长度
            int ntasks = tasks.size();
            // 如果size为0，抛出非法参数异常
            if (ntasks == 0)
                throw new IllegalArgumentException();

            ArrayList<Future<T>> futures = new ArrayList<Future<T>>(ntasks);
            // 将生产新的异步任务与使用已完成任务的结果分离开来的服务，服务基本委托‘this’去完成
            ExecutorCompletionService<T> ecs =
                new ExecutorCompletionService<T>(this);

            // For efficiency, especially in executors with limited
            // parallelism, check to see if previously submitted tasks are
            // done before submitting more of them. This interleaving
            // plus the exception mechanics account for messiness of main
            // loop.

            try {
                // Record exceptions so that if we fail to obtain any
                // result, we can throw the last exception we got.
                ExecutionException ee = null;
                // 根据timed算出截止时间，timed为true结果为当前系统纳秒时间加nanos否则为0
                final long deadline = timed ? System.nanoTime() + nanos : 0L;
                // 获取任务集合的迭代器
                Iterator<? extends Callable<T>> it = tasks.iterator();

               /**
                * 如果我们线程池中只有1个线程，那么提交到线程池中的任务是按照顺序串行执行的，即没有并发能力。
                * 一旦有一个任务正常完成，invokeAny就会返回这个任务的执行结果。所以先提交1个任务，让这个任务能够尽早执行，
                * 这种方式比一下子将所有任务都提交到线程池中效果要略好一些。如果线程池中有很多线程，这种先提交一个任务的方式，也没有什么坏处。
                */

                // Start one task for sure; the rest incrementally
                // 先向线程池提交一个任务
                futures.add(ecs.submit(it.next()));
                // ntasks表示当前还有几个任务没有提交
                // active表示已经提交到线程池中但是还没有执行完成的任务数
                --ntasks;
                int active = 1;
                // 进入死循环
                for (;;) {
                    // 从ExecutorCompletionService的任务完成队列去拉取已经完成的任务（这里的完成是指线程池运行完成，可能成功，可能发生异常）
                    Future<T> f = ecs.poll();
                    // 如果拉取的任务为null
                    if (f == null) {
                        // 判断是否还有任务没有提交
                        if (ntasks > 0) {
                            // 继续提交一个
                            --ntasks;
                            futures.add(ecs.submit(it.next()));
                            ++active;
                        }
                        // 进入这里的条件是：任务都提交了，也没有可执行的任务，应该是任务都初夏了异常
                        else if (active == 0)
                            // 结束循环
                            break;
                        // 还有任务在继续执行
                        else if (timed) {
                            // 阻塞当前线程nanos纳秒，再从队列去取任务
                            f = ecs.poll(nanos, TimeUnit.NANOSECONDS);
                            if (f == null)
                                // 超期，抛出异常
                                throw new TimeoutException();
                            // 下次从队列拉取任务结果所等待的时间
                            nanos = deadline - System.nanoTime();
                        }
                        else
                            // 当前没有任务完成、所有任务已提交 且还有任务在执行时、未设置超时，就不限时长地等待
                            f = ecs.take();
                    }
                    if (f != null) {
                        // 没有执行完的任务数减一
                        --active;
                        try {
                            // 尝试获取结果
                            return f.get();
                            // 如果获取结果失败，保存异常，继续死循环获取有成功结果的任务
                        } catch (ExecutionException eex) {
                            ee = eex;
                        } catch (RuntimeException rex) {
                            ee = new ExecutionException(rex);
                        }
                    }
                }
                if (ee == null)
                    ee = new ExecutionException();
                throw ee;

            } finally {
                // 成功返回后，将剩余的任务都取消掉
                for (int i = 0, size = futures.size(); i < size; i++)
                    futures.get(i).cancel(true);
            }
        }

        public <T> T invokeAny(Collection<? extends Callable<T>> tasks)
            throws InterruptedException, ExecutionException {
            try {
                return doInvokeAny(tasks, false, 0);
            } catch (TimeoutException cannotHappen) {
                assert false;
                return null;
            }
        }

        public <T> T invokeAny(Collection<? extends Callable<T>> tasks,
                               long timeout, TimeUnit unit)
            throws InterruptedException, ExecutionException, TimeoutException {
            return doInvokeAny(tasks, true, unit.toNanos(timeout));
        }

        public <T> List<Future<T>> invokeAll(Collection<? extends Callable<T>> tasks)
            throws InterruptedException {
            // 对集合判空
            if (tasks == null)
                throw new NullPointerException();
            // 根据task长度创建相应长度的Future列表
            ArrayList<Future<T>> futures = new ArrayList<Future<T>>(tasks.size());
            // 完成标志
            boolean done = false;
            try {
                // 遍历集合
                for (Callable<T> t : tasks) {
                    // 封装Callable为FutureTask
                    RunnableFuture<T> f = newTaskFor(t);
                    futures.add(f);
                    // 线程池执行FutureTask
                    execute(f);
                }
                for (int i = 0, size = futures.size(); i < size; i++) {
                    Future<T> f = futures.get(i);
                    // 判断任务是否完成，没完成阻塞获取
                    if (!f.isDone()) {
                        try {
                            f.get();
                        } catch (CancellationException ignore) {
                        } catch (ExecutionException ignore) {
                        }
                    }
                }
                // 修改标志
                done = true;
                return futures;
            } finally {
                // 如果标志没有修改
                if (!done)
                    for (int i = 0, size = futures.size(); i < size; i++)
                        // 取消任务，只是打上中断标记
                        futures.get(i).cancel(true);
            }
        }

        public <T> List<Future<T>> invokeAll(Collection<? extends Callable<T>> tasks,
                                             long timeout, TimeUnit unit)
            throws InterruptedException {
            if (tasks == null)
                throw new NullPointerException();
            // 根据单位换算成纳秒
            long nanos = unit.toNanos(timeout);
            ArrayList<Future<T>> futures = new ArrayList<Future<T>>(tasks.size());
            boolean done = false;
            try {
                for (Callable<T> t : tasks)
                    futures.add(newTaskFor(t));

                final long deadline = System.nanoTime() + nanos;
                final int size = futures.size();

                // Interleave time checks and calls to execute in case
                // executor doesn't have any/much parallelism.
                for (int i = 0; i < size; i++) {
                    execute((Runnable)futures.get(i));
                    // 每次计算距离截止时间还有多少纳秒
                    nanos = deadline - System.nanoTime();
                    if (nanos <= 0L)
                        // 时间到了直接返回
                        return futures;
                }

                for (int i = 0; i < size; i++) {
                    Future<T> f = futures.get(i);
                    // 没有完成阻塞当前线程直到获取结果
                    if (!f.isDone()) {
                        if (nanos <= 0L)
                            // 时间到了直接返回
                            return futures;
                        try {
                            f.get(nanos, TimeUnit.NANOSECONDS);
                        } catch (CancellationException ignore) {
                        } catch (ExecutionException ignore) {
                        } catch (TimeoutException toe) {
                            return futures;
                        }
                        // 计算距离截止时间还有多久
                        nanos = deadline - System.nanoTime();
                    }
                }
                done = true;
                return futures;
            } finally {
                // 完成标志false
                if (!done)
                    for (int i = 0, size = futures.size(); i < size; i++)
                        // 取消任务
                        futures.get(i).cancel(true);
            }
        }

    }

```
