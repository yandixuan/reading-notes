# ConcurrentHashMap

[文章参考](https://blog.csdn.net/weixin_30342639/article/details/107420546)

Java 7 为实现并行访问，引入了 Segment 这一结构，实现了分段锁，理论上最大并发度与 Segment 个数相等。

Java 8 放弃了一个 HashMap 被一个 Segment 封装加上锁的复杂设计，取而代之的是在 HashMap 的每个 Node 上增加 CAS + Synchronized 来保证并发安全进行实现。

同时为了提高哈希碰撞下的寻址性能，Java 8 在链表长度超过一定阈值（8）时将链表（寻址时间复杂度为 O(N)）转换为 红黑树（寻址时间复杂度为 O(log(N))）

那么我肯定是基于 java8 进行源码学习

:::tip 提示
在 HashMap 中是允许 key 和 value 为 null 的，而在 ConcurrentHashMap 中则是不允许的会直接抛出空指针异常。
在 HashMap 根据 key 获取的值是 null，而我们根本分不清楚到底这个 key 是不存在导致 get 为 null 还是存在还是值为 null，确实但是 hashMap 中我们可以
通过 containsKey 来判断属于哪一种情况，而在多线程的环境中，null 存在二义性允许，索性 Doug Lea 设定好代码规范 key，value 都不能为 null
:::

```java
    public class ConcurrentHashMap<K,V> extends AbstractMap<K,V>
    implements ConcurrentMap<K,V>, Serializable {
        private static final long serialVersionUID = 7249069246763182397L;

    ...省略
    }
```

## 属性

### TREEBIN

红黑树根节点的 hash 值即-2

```java
    static final int TREEBIN   = -2;
```

### MOVED

forwarding nodes 节点的 hash 值，只有 table 发生扩容的时候，ForwardingNode 才会发挥作用，表示当前节点正处于 resize 的过程 (表示 map 正在扩容)

```java
    static final int MOVED     = -1; // hash for forwarding nodes
```

### HASH_BITS

0x7fffffff 是 16 进制，转化成二进制是正数的最大值（即 0111 1111 1111 1111 1111 1111 1111 1111）。

作用其实就是避免 hash 值是负数，大概是因为 ConcurrentHashMap 内置了 MOVED、TREEBIN、RESERVED 这 3 个 hash（是负数），为了避免冲突吧。

```java
    static final int HASH_BITS = 0x7fffffff; // usable bits of normal node hash
```

### nextTable

resize 的时候使用

```java
    private transient volatile Node<K,V>[] nextTable;
```

### RESIZE_STAMP_BITS

用来给 resizeStamp 调用生成一个和扩容有关的扩容戳

```java
    private static int RESIZE_STAMP_BITS = 16;
```

:::tip SizeCtl

- 为 0 的时候代表表示还没有初始化
- 在调用有参构造函数的时候，存放的是需要初始化的容量
- 初始化之后表示下一次扩容的阈值

:::

### UNSAFE

```java

// 获取obj对象中offset偏移地址对应的object型field的值,支持volatile load语义。
public native Object getObjectVolatile(Object obj, long offset);

// 获取数组中第一个元素的偏移量(get offset of a first element in the array)
public native int arrayBaseOffset(java.lang.Class aClass);

//获取数组中一个元素的大小(get size of an element in the array)
public native int arrayIndexScale(java.lang.Class aClass);

```

```java

    // Unsafe mechanics
    private static final sun.misc.Unsafe U;
    private static final long SIZECTL;
    private static final long TRANSFERINDEX;
    private static final long BASECOUNT;
    private static final long CELLSBUSY;
    private static final long CELLVALUE;
    private static final long ABASE;
    private static final int ASHIFT;

    static {
        try {
            // 获取UNSAFE实例
            U = sun.misc.Unsafe.getUnsafe();
            // 获取 ConcurrentHashMap的Class对象
            Class<?> k = ConcurrentHashMap.class;
            SIZECTL = U.objectFieldOffset
                (k.getDeclaredField("sizeCtl"));
            TRANSFERINDEX = U.objectFieldOffset
                (k.getDeclaredField("transferIndex"));
            BASECOUNT = U.objectFieldOffset
                (k.getDeclaredField("baseCount"));
            CELLSBUSY = U.objectFieldOffset
                (k.getDeclaredField("cellsBusy"));
            Class<?> ck = CounterCell.class;
            CELLVALUE = U.objectFieldOffset
                (ck.getDeclaredField("value"));
            // 获取Node的class对象，在ConcurrentHashMap中Node便是主要存储介质
            Class<?> ak = Node[].class;
            /**
            * 获取Node数组在内存中第一个元素的偏移位置,这部分偏移量等于对象头的长度
            * 64位jdk，对象头： markword 8字节、class pointer 4字节（默认开启压缩）、arr length 4字节，所以ABASE=16
            */
            ABASE = U.arrayBaseOffset(ak);
            /**
            * 获取数组中元素的增量地址，就是数组元素每个元素的空间大小，比如int，就是4
            * 结合来使用 ABASE+i*scale就是每个元素对应的内存位置
            */
            int scale = U.arrayIndexScale(ak);
            // 检验2的幂次方
            if ((scale & (scale - 1)) != 0)
                throw new Error("data type scale not a power of two");
            /**
            * Integer.numberOfLeadingZeros 该方法的作用是返回无符号整型i的最高非零位前面的0的个数，包括符号位在内；
            * ASHIFT也就是相应每个元素对应的长度 其实就是4 这里是用位移优化计算效率
            * 为啥用31去减 因为scale的二进制前面（32-3也等同于index相减31-2）个0，从而得出偏移量 0100（10进制2）
            * 数组寻址 数组寻址[i]位置地址 = 数组初始偏移+元素大小*i;(数组是连续的内存空间)
            * 在这里就是 ABASE+i<<ASHIFT = ABASE+i*4 跟上面的寻址公式对应
            */
            ASHIFT = 31 - Integer.numberOfLeadingZeros(scale);
        } catch (Exception e) {
            throw new Error(e);
        }
    }

```

那么顺带我们也把 Integer.numberOfLeadingZeros 给分析下子

#### 这一系列的判断，实际上是二分法的应用。

如果 i 无符号右移 16 位等于 0 说明 那么说明最高非 0 的数在低 16 位，那么位数 n 可以先加 16 位（前面都是 0）,并且将 i 的低 16 位左移 16 位(这里我们发现规律相当于是把前面的 0 都移除掉了)

如果 i 无符号右移 24 位等于 0 说明 那么说明最高非 0 的数在低 24 位，那么位数 n 可以先加 8 位 （前面都是 0）,并且将 i 的低 24 位左移 8 位(这里我们发现规律相当于是把前面的 0 都移除掉了)

...

后续依次类推

最后我们处理到了 30 位，实际上是处理最后 2 位 无论是 01 还是 10 i 右移 31 位只剩 1 位，

举个例子 10 右移 31 位 0....1 1+30-1=30 个 0

举个例子 01 右移 31 位 0....0 1+30-0=31 个 0

```java
    /**
    * 该方法的作用是返回无符号整型i的最高非零位前面的0的个数，包括符号位在内；
    * 如果i为负数，这个方法将会返回0，符号位为1.
    */
    public static int numberOfLeadingZeros(int i) {
        // HD, Figure 5-6
        if (i == 0)
            return 32;
        int n = 1;
        if (i >>> 16 == 0) { n += 16; i <<= 16; }
        if (i >>> 24 == 0) { n +=  8; i <<=  8; }
        if (i >>> 28 == 0) { n +=  4; i <<=  4; }
        if (i >>> 30 == 0) { n +=  2; i <<=  2; }
        n -= i >>> 31;
        return n;
    }

```

## 内部类

### TreeBin

TreeBin 并不是红黑树的存储节点，TreeBin 通过 root 属性维护红黑树的根结点，因为红黑树在旋转的时候，
根结点可能会被它原来的子节点替换掉，在这个时间点，如果有其他线程要写这棵红黑树就会发生线程不安全问题，
所以在 ConcurrentHashMap 中 TreeBin 通过 waiter 属性维护当前使用这棵红黑树的线程，来防止其他线程的进入

```java

    static final class TreeBin<K,V> extends Node<K,V> {
        // 维护树根节点
        TreeNode<K,V> root;
        // 链表头节点
        volatile TreeNode<K,V> first;
        // 最近一个设置waiter标识的线程
        volatile Thread waiter;
        // 锁状态标识
        volatile int lockState;
        // values for lockState
        // 写锁 写是独占状态，以散列表来看，真正进入到TreeBin中的写线程 同一时刻 只有一个线程
        static final int WRITER = 1; // set while holding write lock
        // 等待者状态（写线程在等待），当TreeBin中有读线程目前正在读取数据时，写线程无法修改数据
        static final int WAITER = 2; // set when waiting for write lock
        // 读锁 读锁是共享，同一时刻可以有多个线程 同时进入到 TreeBin对象中获取数据
        static final int READER = 4; // increment value for setting read lock

        /**
         * Tie-breaking utility for ordering insertions when equal
         * hashCodes and non-comparable. We don't require a total
         * order, just a consistent insertion rule to maintain
         * equivalence across rebalancings. Tie-breaking further than
         * necessary simplifies testing a bit.
         */
        static int tieBreakOrder(Object a, Object b) {
            int d;
            if (a == null || b == null ||
                (d = a.getClass().getName().
                 compareTo(b.getClass().getName())) == 0)
                d = (System.identityHashCode(a) <= System.identityHashCode(b) ?
                     -1 : 1);
            return d;
        }

        /**
         * 根据TreeNode节点B初始化 TreeBin
         * Creates bin with initial set of nodes headed by b.
         */
        TreeBin(TreeNode<K,V> b) {
            // TreeBin节点hash值为 TREEBIN 即-2
            super(TREEBIN, null, null, null);
            // 链表起始节点为TreeNode b
            this.first = b;
            // 根节点r置空
            TreeNode<K,V> r = null;
            for (TreeNode<K,V> x = b, next; x != null; x = next) {
                // 先获取b的下一个节点
                next = (TreeNode<K,V>)x.next;
                // 将x的左右子节点强行置空
                x.left = x.right = null;
                // 条件成立：说明当前红黑树 是一个空树，那么设置插入元素 为根节点
                if (r == null) {
                    x.parent = null;
                    // 根节点为黑色
                    x.red = false;
                    r = x;
                }
                else {
                    // 非第一次循环，都会进入else分支，此时红黑树已经有数据了
                    // k 表示 插入节点的key
                    K k = x.key;
                    // h 表示 插入节点的hash
                    int h = x.hash;
                    // kc 表示 插入节点key的class类型
                    Class<?> kc = null;
                    // 遍历红黑树插入节点
                    for (TreeNode<K,V> p = r;;) {
                        // 临时遍历ph为被比较节点hash值
                        int dir, ph;
                        K pk = p.key;
                        // 树节点左边
                        if ((ph = p.hash) > h)
                            dir = -1;
                        // 树节点右边
                        else if (ph < h)
                            dir = 1;
                        // 如果 插入节点的类型为null且 kc没有实现Comparable接口或 k与pk相同（也包含kc的class类为null或k,pk的clas类型不相同）任意满足其一
                        // 的话都会根据2者的内存hashcode决定是树的左边还是右边
                        else if ((kc == null &&
                                  (kc = comparableClassFor(k)) == null) ||
                                 (dir = compareComparables(kc, k, pk)) == 0)
                            dir = tieBreakOrder(k, pk);
                            TreeNode<K,V> xp = p;
                        // 如果p的左边、或右边没有子节点了那么么进行插入节点
                        if ((p = (dir <= 0) ? p.left : p.right) == null) {
                            // 父子节点互相连接
                            x.parent = xp;
                            if (dir <= 0)
                                xp.left = x;
                            else
                                xp.right = x;
                            // 插入的节点可能会破坏红黑树特性，调用插入调整方法
                            r = balanceInsertion(r, x);
                            // 结束遍历红黑树的循环，继续遍历链表
                            break;
                        }
                    }
                }
            }
            // 将根节点设置成r
            this.root = r;
            // 递归检查红黑树的正确性（注意：assert关键字是受java启动项配置的，-ea 开启）
            assert checkInvariants(root);
        }

        /**
         * Acquires write lock for tree restructuring.
         */
        private final void lockRoot() {
            // 直接尝试CAS的将lockState从0变成WRITER（1）状态，即从没有锁变成获取了写锁的状态，只尝试一次，没有循环。
            if (!U.compareAndSwapInt(this, LOCKSTATE, 0, WRITER))
                //如果 CAS失败，那么调用contendedLock方法，继续获取直到成功才返回
                contendedLock(); // offload to separate method
        }

        /**
         * Releases write lock for tree restructuring.
         */
        private final void unlockRoot() {
            lockState = 0;
        }

        /**
         * Possibly blocks awaiting root lock.
         */
        private final void contendedLock() {
            // 初始化一个waiting标志，默认为false，开启一个死循环
            boolean waiting = false;
            for (int s;;) {
               /**
                * 这里的 ~WAITER，即~2，即表示 -3 是一个固定值
                *  2的二进制：0000 0000 0000 0000 0000 0000 0000 0010
                * ~2的二进制：1111 1111 1111 1111 1111 1111 1111 1101（补码）
                * 显然~2是负数，读取规则取反+1为
                *           1000 0000 0000 0000 0000 0000 0000 0011（即-3）
                * 这里只是告知 ~2==-3而已没有实际意义
                * 因此 lockState为0(二进制数全是0)或者2(二进制数为10)时，lockState与 ~WAITER的结果才为 0（倒推法就可知）
                * lockState为0时，表示没有任何线程获取任何锁；
                * locKState为2时，表示只有一个写线程在等待获取锁，这也就是前面讲的find方法中，最后一个读线程释放了读锁并且还有写线程等待获取写锁的情况，实际上就是该线程
                */
                if (((s = lockState) & ~WAITER) == 0) {
                    if (U.compareAndSwapInt(this, LOCKSTATE, s, WRITER)) {
                        //条件成立：说明写线程 抢占锁成功
                         if (waiting)
                            // 如果waiting标志位为true，那么将waiter清空，因为waiter是waiting为true时设置的，表示此时没有写线程在等待写锁
                            waiter = null;
                        return;
                    }
                }
                /**
                 * 否则，判断 s & WAITER==0
                 * WAITER固定为2
                 * 如果s & WAITER为0，即需要s & 2 =0，那么s(lockState)必须为1或者大于2的数，比如4、8等等
                 * 由于不存在写并发（外面对写操作加上了synchronized锁），因此lockState一定属于大于2的数，比如4、8等等
                 * 这表示有线程获取到了读锁，此时写线程应该等待
                 *
                 */
                else if ((s & WAITER) == 0) {
                     // 尝试将lockState设置为s | WAITER  ，这里的s|WAITER就相当于s+WAITER，即将此时的lockState加上2，表示有写线程在等待获取写锁
                    if (U.compareAndSwapInt(this, LOCKSTATE, s, s | WAITER)) {
                        waiting = true;
                        // waiter设置为当前线程
                        waiter = Thread.currentThread();
                    }
                }
                /**
                 * 根据标志判断是否阻塞自己
                 * 此时写线程不再继续执行代码，而是等待被唤醒
                 * 如果被唤醒，那么可能是因为最后一个读锁也被释放了，或者是因为被中断，那么继续循环获取锁
                 * 该循环的唯一出口就是获取到了写锁该循环的唯一出口就是获取到了写锁
                 */
                else if (waiting)
                    LockSupport.park(this);
            }
        }

        /**
         * 读节点
         * Returns matching node or null if none. Tries to search
         * using tree comparisons from root, but continues linear
         * search when lock not available.
         */
        final Node<K,V> find(int h, Object k) {
            // key首要条件不能null
            if (k != null) {
                // 从first节点开始遍历，直到节点为null才停止循环
                for (Node<K,V> e = first; e != null; ) {
                    int s; K ek;
                    // WAITER|WRITER 等同于 WAITER+WRITER=1+2=3 ==>0011
                    // lockState & 0011 != 0 条件成立：说明当前TreeBin 有写等待线程 或者 写操作线程正在加锁
                    if (((s = lockState) & (WAITER|WRITER)) != 0) {
                        // 找到key直接返回e
                        if (e.hash == h &&
                            ((ek = e.key) == k || (ek != null && k.equals(ek))))
                            return e;
                        // 无法读树那么就根据链表结构依次读取，好处就是不会阻塞读取的过程
                        e = e.next;
                    }
                    // 前置条件：当前TreeBin中 写等待线程 或者 写线程 都没有
                    // 条件成立：说明添加读锁成功 每个线程都会给 LOCKSTATE+4
                    else if (U.compareAndSwapInt(this, LOCKSTATE, s,
                                                 s + READER)) {
                        // 获取到读锁，那么就从根节点遍历，TreeBin只是封装了锁，实际上找数据节点还是委托给了TreeNode来找
                        TreeNode<K,V> r, p;
                        try {
                            p = ((r = root) == null ? null :
                                 r.findTreeNode(h, k, null));
                        } finally {
                            Thread w;
                            // U.getAndAddInt(this, LOCKSTATE, -READER) == (READER|WAITER)
                            // 1.当前线程查询红黑树结束，释放当前线程的读锁 就是让 lockstate 值 - 4
                            // (READER|WAITER) = 0110 => 表示当前只有一个线程在读，且“有一个写线程在等待”
                            // 当前读线程为 TreeBin中的最后一个读线程。
                            // getAndAddInt含义是返回当前值，并不是修改值所以进入if的是最后一个读线程了，所以我们要唤醒等待写线程了
                            if (U.getAndAddInt(this, LOCKSTATE, -READER) ==
                                (READER|WAITER) && (w = waiter) != null)
                                // 如果是最后一个读线程，并且有写线程因为读锁而阻塞，要告诉写线程可以尝试获取写锁了。
                                LockSupport.unpark(w);
                        }
                        return p;
                    }
                }
            }
            return null;
        }

        /**
         * Finds or adds a node.
         * @return null if added
         */
        final TreeNode<K,V> putTreeVal(int h, K k, V v) {
            Class<?> kc = null;
            boolean searched = false;
            for (TreeNode<K,V> p = root;;) {
                int dir, ph; K pk;
                if (p == null) {
                    first = root = new TreeNode<K,V>(h, k, v, null, null);
                    break;
                }
                else if ((ph = p.hash) > h)
                    dir = -1;
                else if (ph < h)
                    dir = 1;
                else if ((pk = p.key) == k || (pk != null && k.equals(pk)))
                    return p;
                else if ((kc == null &&
                          (kc = comparableClassFor(k)) == null) ||
                         (dir = compareComparables(kc, k, pk)) == 0) {
                    if (!searched) {
                        TreeNode<K,V> q, ch;
                        searched = true;
                        if (((ch = p.left) != null &&
                             (q = ch.findTreeNode(h, k, kc)) != null) ||
                            ((ch = p.right) != null &&
                             (q = ch.findTreeNode(h, k, kc)) != null))
                            return q;
                    }
                    dir = tieBreakOrder(k, pk);
                }

                TreeNode<K,V> xp = p;
                if ((p = (dir <= 0) ? p.left : p.right) == null) {
                    TreeNode<K,V> x, f = first;
                    first = x = new TreeNode<K,V>(h, k, v, f, xp);
                    if (f != null)
                        f.prev = x;
                    if (dir <= 0)
                        xp.left = x;
                    else
                        xp.right = x;
                    if (!xp.red)
                        x.red = true;
                    else {
                        // 在这里准备插入节点，给根节点加锁
                        lockRoot();
                        try {
                            // 插入平衡调整完后，重新赋值root节点，可能在调整的过程中根节点发生了变化
                            root = balanceInsertion(root, x);
                        } finally {
                            // 解锁根节点
                            unlockRoot();
                        }
                    }
                    break;
                }
            }
            assert checkInvariants(root);
            return null;
        }

        /**
         * Removes the given node, that must be present before this
         * call.  This is messier than typical red-black deletion code
         * because we cannot swap the contents of an interior node
         * with a leaf successor that is pinned by "next" pointers
         * that are accessible independently of lock. So instead we
         * swap the tree linkages.
         *
         * @return true if now too small, so should be untreeified
         */
        final boolean removeTreeNode(TreeNode<K,V> p) {
            // 读过HashMap的我们知道，TreeNode 即包含树关系也包含链表关系
            // 那么unlink节点p在链表中的关系
            TreeNode<K,V> next = (TreeNode<K,V>)p.next;
            TreeNode<K,V> pred = p.prev;  // unlink traversal pointers
            TreeNode<K,V> r, rl;
            if (pred == null)
                first = next;
            else
                pred.next = next;
            if (next != null)
                next.prev = pred;
            if (first == null) {
                root = null;
                return true;
            }
            if ((r = root) == null || r.right == null || // too small
                (rl = r.left) == null || rl.left == null)
                return true;
            // 一旦上面进入return true的分支说明节点过少，树要退化为链表
            // 锁住树的根节点，删除节点跟HashMap流程一致没啥好说的
            lockRoot();
            try {
                TreeNode<K,V> replacement;
                TreeNode<K,V> pl = p.left;
                TreeNode<K,V> pr = p.right;
                if (pl != null && pr != null) {
                    TreeNode<K,V> s = pr, sl;
                    while ((sl = s.left) != null) // find successor
                        s = sl;
                    boolean c = s.red; s.red = p.red; p.red = c; // swap colors
                    TreeNode<K,V> sr = s.right;
                    TreeNode<K,V> pp = p.parent;
                    if (s == pr) { // p was s's direct parent
                        p.parent = s;
                        s.right = p;
                    }
                    else {
                        TreeNode<K,V> sp = s.parent;
                        if ((p.parent = sp) != null) {
                            if (s == sp.left)
                                sp.left = p;
                            else
                                sp.right = p;
                        }
                        if ((s.right = pr) != null)
                            pr.parent = s;
                    }
                    p.left = null;
                    if ((p.right = sr) != null)
                        sr.parent = p;
                    if ((s.left = pl) != null)
                        pl.parent = s;
                    if ((s.parent = pp) == null)
                        r = s;
                    else if (p == pp.left)
                        pp.left = s;
                    else
                        pp.right = s;
                    if (sr != null)
                        replacement = sr;
                    else
                        replacement = p;
                }
                else if (pl != null)
                    replacement = pl;
                else if (pr != null)
                    replacement = pr;
                else
                    replacement = p;
                if (replacement != p) {
                    TreeNode<K,V> pp = replacement.parent = p.parent;
                    if (pp == null)
                        r = replacement;
                    else if (p == pp.left)
                        pp.left = replacement;
                    else
                        pp.right = replacement;
                    p.left = p.right = p.parent = null;
                }

                root = (p.red) ? r : balanceDeletion(r, replacement);

                if (p == replacement) {  // detach pointers
                    TreeNode<K,V> pp;
                    if ((pp = p.parent) != null) {
                        if (p == pp.left)
                            pp.left = null;
                        else if (p == pp.right)
                            pp.right = null;
                        p.parent = null;
                    }
                }
            } finally {
                unlockRoot();
            }
            assert checkInvariants(root);
            return false;
        }

        /* ------------------------------------------------------------ */
        // Red-black tree methods, all adapted from CLR

        static <K,V> TreeNode<K,V> rotateLeft(TreeNode<K,V> root,
                                              TreeNode<K,V> p) {
            TreeNode<K,V> r, pp, rl;
            if (p != null && (r = p.right) != null) {
                if ((rl = p.right = r.left) != null)
                    rl.parent = p;
                if ((pp = r.parent = p.parent) == null)
                    (root = r).red = false;
                else if (pp.left == p)
                    pp.left = r;
                else
                    pp.right = r;
                r.left = p;
                p.parent = r;
            }
            return root;
        }

        static <K,V> TreeNode<K,V> rotateRight(TreeNode<K,V> root,
                                               TreeNode<K,V> p) {
            TreeNode<K,V> l, pp, lr;
            if (p != null && (l = p.left) != null) {
                if ((lr = p.left = l.right) != null)
                    lr.parent = p;
                if ((pp = l.parent = p.parent) == null)
                    (root = l).red = false;
                else if (pp.right == p)
                    pp.right = l;
                else
                    pp.left = l;
                l.right = p;
                p.parent = l;
            }
            return root;
        }

        static <K,V> TreeNode<K,V> balanceInsertion(TreeNode<K,V> root,
                                                    TreeNode<K,V> x) {
            x.red = true;
            for (TreeNode<K,V> xp, xpp, xppl, xppr;;) {
                if ((xp = x.parent) == null) {
                    x.red = false;
                    return x;
                }
                else if (!xp.red || (xpp = xp.parent) == null)
                    return root;
                if (xp == (xppl = xpp.left)) {
                    if ((xppr = xpp.right) != null && xppr.red) {
                        xppr.red = false;
                        xp.red = false;
                        xpp.red = true;
                        x = xpp;
                    }
                    else {
                        if (x == xp.right) {
                            root = rotateLeft(root, x = xp);
                            xpp = (xp = x.parent) == null ? null : xp.parent;
                        }
                        if (xp != null) {
                            xp.red = false;
                            if (xpp != null) {
                                xpp.red = true;
                                root = rotateRight(root, xpp);
                            }
                        }
                    }
                }
                else {
                    if (xppl != null && xppl.red) {
                        xppl.red = false;
                        xp.red = false;
                        xpp.red = true;
                        x = xpp;
                    }
                    else {
                        if (x == xp.left) {
                            root = rotateRight(root, x = xp);
                            xpp = (xp = x.parent) == null ? null : xp.parent;
                        }
                        if (xp != null) {
                            xp.red = false;
                            if (xpp != null) {
                                xpp.red = true;
                                root = rotateLeft(root, xpp);
                            }
                        }
                    }
                }
            }
        }

        static <K,V> TreeNode<K,V> balanceDeletion(TreeNode<K,V> root,
                                                   TreeNode<K,V> x) {
            for (TreeNode<K,V> xp, xpl, xpr;;)  {
                if (x == null || x == root)
                    return root;
                else if ((xp = x.parent) == null) {
                    x.red = false;
                    return x;
                }
                else if (x.red) {
                    x.red = false;
                    return root;
                }
                else if ((xpl = xp.left) == x) {
                    if ((xpr = xp.right) != null && xpr.red) {
                        xpr.red = false;
                        xp.red = true;
                        root = rotateLeft(root, xp);
                        xpr = (xp = x.parent) == null ? null : xp.right;
                    }
                    if (xpr == null)
                        x = xp;
                    else {
                        TreeNode<K,V> sl = xpr.left, sr = xpr.right;
                        if ((sr == null || !sr.red) &&
                            (sl == null || !sl.red)) {
                            xpr.red = true;
                            x = xp;
                        }
                        else {
                            if (sr == null || !sr.red) {
                                if (sl != null)
                                    sl.red = false;
                                xpr.red = true;
                                root = rotateRight(root, xpr);
                                xpr = (xp = x.parent) == null ?
                                    null : xp.right;
                            }
                            if (xpr != null) {
                                xpr.red = (xp == null) ? false : xp.red;
                                if ((sr = xpr.right) != null)
                                    sr.red = false;
                            }
                            if (xp != null) {
                                xp.red = false;
                                root = rotateLeft(root, xp);
                            }
                            x = root;
                        }
                    }
                }
                else { // symmetric
                    if (xpl != null && xpl.red) {
                        xpl.red = false;
                        xp.red = true;
                        root = rotateRight(root, xp);
                        xpl = (xp = x.parent) == null ? null : xp.left;
                    }
                    if (xpl == null)
                        x = xp;
                    else {
                        TreeNode<K,V> sl = xpl.left, sr = xpl.right;
                        if ((sl == null || !sl.red) &&
                            (sr == null || !sr.red)) {
                            xpl.red = true;
                            x = xp;
                        }
                        else {
                            if (sl == null || !sl.red) {
                                if (sr != null)
                                    sr.red = false;
                                xpl.red = true;
                                root = rotateLeft(root, xpl);
                                xpl = (xp = x.parent) == null ?
                                    null : xp.left;
                            }
                            if (xpl != null) {
                                xpl.red = (xp == null) ? false : xp.red;
                                if ((sl = xpl.left) != null)
                                    sl.red = false;
                            }
                            if (xp != null) {
                                xp.red = false;
                                root = rotateRight(root, xp);
                            }
                            x = root;
                        }
                    }
                }
            }
        }

        /**
         * Recursive invariant check
         */
        static <K,V> boolean checkInvariants(TreeNode<K,V> t) {
            TreeNode<K,V> tp = t.parent, tl = t.left, tr = t.right,
                tb = t.prev, tn = (TreeNode<K,V>)t.next;
            if (tb != null && tb.next != t)
                return false;
            if (tn != null && tn.prev != t)
                return false;
            if (tp != null && t != tp.left && t != tp.right)
                return false;
            if (tl != null && (tl.parent != t || tl.hash > t.hash))
                return false;
            if (tr != null && (tr.parent != t || tr.hash < t.hash))
                return false;
            if (t.red && tl != null && tl.red && tr != null && tr.red)
                return false;
            if (tl != null && !checkInvariants(tl))
                return false;
            if (tr != null && !checkInvariants(tr))
                return false;
            return true;
        }
        // Unsafe实例
        private static final sun.misc.Unsafe U;
        // lockState在内存中的偏移量
        private static final long LOCKSTATE;
        static {
            try {
                U = sun.misc.Unsafe.getUnsafe();
                Class<?> k = TreeBin.class;
                // 获取偏移量
                LOCKSTATE = U.objectFieldOffset
                    (k.getDeclaredField("lockState"));
            } catch (Exception e) {
                throw new Error(e);
            }
        }
    }

```

## 构造方法

```java

    /**
    * 无参构造器
    * 空实现，所有参数都是走默认的
    */
    public ConcurrentHashMap() {

    }

    /**
    * 根据 initialCapacity参数
    */
    public ConcurrentHashMap(int initialCapacity) {
        // initialCapacity非负校验
        if (initialCapacity < 0)
            throw new IllegalArgumentException();
        // 与HashMap不同的是，这里initialCapacity如果大于等于2的29次方的时候（HashMap这里为超过2的30次方），
        // 就重置为2的30次方
        // tableSizeFor方法是用来求出大于等于指定值的最小2次幂的
        // 在HashMap中仅仅就是对设定的数组容量取最小2次幂，而这里首先对设定值*1.5+1后进行取最小的2次幂
        int cap = ((initialCapacity >= (MAXIMUM_CAPACITY >>> 1)) ?
                   MAXIMUM_CAPACITY :
                   tableSizeFor(initialCapacity + (initialCapacity >>> 1) + 1));

        /**
        * 其实传进来的容量实际上并不是存进去的桶的个数，而是需要扩容时的个数
        * 16 * 0.75 = 12，在HashMap中，我们传进来的其实是16，需要乘负载因子后才是实际需要扩容时的阈值点
        * 所以在构造器阶段需要除以负载因子，以此来求出真正的桶的个数，那也应该是数组容量 / 默认值的0.75啊
        * 举个例子：
        * 打个比方我们传进来的是22， 那么/ 0.75的方式结果是29.3，+1后再tableSizeFor结果是：32
        * 而*1.5的方式结果是33，+1后再tableSizeFor结果是：64，那么可以看出1.5计算出的容量明细是不对的。明显多扩容了一倍
        * 也确实这是一个bug 不过多扩容一倍也不会对使用产生多大的影响
        */

        /**
        * 在JDK11中相应容量的代码也被修复了
        * long size = (long) (1.0 + (long) initialCapacity / loadFactor);
        */

        // （类似于HashMap初始化时的threshold）存放初始容量
        this.sizeCtl = cap;
    }

    public ConcurrentHashMap(Map<? extends K, ? extends V> m) {
        this.sizeCtl = DEFAULT_CAPACITY;
        putAll(m);
    }

    public ConcurrentHashMap(int initialCapacity, float loadFactor) {
        this(initialCapacity, loadFactor, 1);
    }
    /**
    * @param initialCapacity 初始化的容量,通过位运算根据这个值计算出一个2的N次幂的值,来作为 hash buckets数组的size.
    * @param loadFactor hash buckets的密度,根据这个值来确定是否需要扩容.默认0.75
    * @param concurrencyLevel 并发更新线程的预估数量.默认1.
    */
    public ConcurrentHashMap(int initialCapacity,
                             float loadFactor, int concurrencyLevel) {
        // 验证参数有效性
        if (!(loadFactor > 0.0f) || initialCapacity < 0 || concurrencyLevel <= 0)
            throw new IllegalArgumentException();
        // 如果初始容量小于并发等级 则初始容量为并发等级
        if (initialCapacity < concurrencyLevel)   // Use at least as many bins
            initialCapacity = concurrencyLevel;   // as estimated threads
        // 因为小数会截断，所以+1
        long size = (long)(1.0 + (long)initialCapacity / loadFactor);
        int cap = (size >= (long)MAXIMUM_CAPACITY) ?
            MAXIMUM_CAPACITY : tableSizeFor((int)size);
        this.sizeCtl = cap;
    }


```

## 方法

### putVal

```java
    final V putVal(K key, V value, boolean onlyIfAbsent) {
        // 检验参数是否合法
        if (key == null || value == null) throw new NullPointerException();
        int hash = spread(key.hashCode());
        int binCount = 0;
        // 死循环
        for (Node<K,V>[] tab = table;;) {
            Node<K,V> f; int n, i, fh;
            // 如果 table为空
            if (tab == null || (n = tab.length) == 0)
                // 初始化table
                tab = initTable();
            /**
            * 这个地方为什么不直接用tab[i]来找元素呢？
            * 虽然table数组本身是增加了volatile属性，但是“volatile的数组只针对数组的引用具有volatile的语义，而不是它的元素”。
            * 所以如果有其他线程对这个数组的元素进行写操作，那么当前线程来读的时候不一定能读到最新的值。
            */
            // 如果通过CAS加载i对应位置的元素为null
            else if ((f = tabAt(tab, i = (n - 1) & hash)) == null) {
                // CAS设置元素，true设置成功直接break循环
                if (casTabAt(tab, i, null,
                             new Node<K,V>(hash, key, value, null)))
                    break;                   // no lock when adding to empty bin
            }
            // 如果当前的桶的第一个元素是一个ForwardingNode节点，说明map正在扩容，则该线程尝试加入扩容
            else if ((fh = f.hash) == MOVED)
                tab = helpTransfer(tab, f);
            else {
                // 如果桶数组已经初始化好了，该扩容的也扩容了，并且根据哈希定位到的桶中已经有元素了,那么直接给桶进行加锁，
                // 这里通过synchronized关键字进行实现
                V oldVal = null;
                synchronized (f) {
                    // 双重检查，防止索引i对应的根节点f内存地址已经被其他线程修改
                    // 扩容会更改桶根节点f的地址
                    if (tabAt(tab, i) == f) {
                        // 如果根节点f的hash值大于等于0 证明是链表节点
                        if (fh >= 0) {
                            // 首先binCount赋值1，因为在循环完之后binCount才自增
                            binCount = 1;
                            for (Node<K,V> e = f;; ++binCount) {
                                K ek;
                                // hash匹配并且key不为null且相同
                                if (e.hash == hash &&
                                    ((ek = e.key) == key ||
                                     (ek != null && key.equals(ek)))) {
                                    // 获取oldVla
                                    oldVal = e.val;
                                    // putIfAbsent时才进去
                                    if (!onlyIfAbsent)
                                        e.val = value;
                                    // 由于找到了直接退出循环
                                    break;
                                }
                                Node<K,V> pred = e;
                                // 一直遍历链表，最终没找到直接插入节点
                                if ((e = e.next) == null) {
                                    pred.next = new Node<K,V>(hash, key,
                                                              value, null);
                                    // 退出循环
                                    break;
                                }
                            }
                        }
                        // 如果f节点是TreeBin类型，TreeBin的hash是负数
                        else if (f instanceof TreeBin) {
                            Node<K,V> p;
                            binCount = 2;
                            // 调用 TreeBin的putTreeVal方法
                            if ((p = ((TreeBin<K,V>)f).putTreeVal(hash, key,
                                                           value)) != null) {
                                oldVal = p.val;
                                // putIfAbsent不会进入下面分支
                                if (!onlyIfAbsent)
                                    p.val = value;
                            }
                        }
                    }
                }
                // binCount前提条件不等于0
                if (binCount != 0) {
                    // 如果 binCount大于链表转树的节点个数阈值
                    if (binCount >= TREEIFY_THRESHOLD)
                        treeifyBin(tab, i);
                    if (oldVal != null)
                        return oldVal;
                    // 退出循环
                    break;
                }
            }
        }
        addCount(1L, binCount);
        return null;
    }

```

### spread（计算 hash 值）

(h ^ (h >>> 16))的作用就是让 hash 值 h 的高 16 与低 16 异或让值分布的更加散列减少冲突，那么 HASH_BITS 的作用是什么呢？

```java
    static final int spread(int h) {
        return (h ^ (h >>> 16)) & HASH_BITS;
    }
```

### initTable

构造函数只是对 sizeCtl 进行了初始化，并没有对存放节点 Node 进行初始化，在该方法进行数组的初始化

```java

    private final Node<K,V>[] initTable() {
        Node<K,V>[] tab; int sc;
        // 当table为空时就不停循环
        while ((tab = table) == null || tab.length == 0) {
            // 如果 sizeCtl小于0代表有其他线程正则执行 initTable 方法
            if ((sc = sizeCtl) < 0)
                // 线程主动让出CPU时间
                Thread.yield(); // lost initialization race; just spin
            // 如果 sizeCtl==0 通过CAS更新sizeCtl为-1如果成功说明该线程可以执行initTable方法进行初始化
            else if (U.compareAndSwapInt(this, SIZECTL, sc, -1)) {
                try {
                    if ((tab = table) == null || tab.length == 0) {
                        // 如果 sizeCtl>0 初始化大小为sizeCtl，否则初始化大小为16
                        int n = (sc > 0) ? sc : DEFAULT_CAPACITY;
                        @SuppressWarnings("unchecked")
                        // 创建数组
                        Node<K,V>[] nt = (Node<K,V>[])new Node<?,?>[n];
                        // 赋值
                        table = tab = nt;
                        // 算出扩容阈值 sc*0.75
                        sc = n - (n >>> 2);
                    }
                } finally {
                    // 将下次扩容的阈值赋给 sizeCtl
                    sizeCtl = sc;
                }
                // 结束循环
                break;
            }
        }
        // 返回数组
        return tab;
    }

```

### tabAt

```java
    /**
    * 强制从主存中加载对应i的数组元素，要求属性被volatile修饰，否则功能和getObject方法相同
    */
    static final <K,V> Node<K,V> tabAt(Node<K,V>[] tab, int i) {
        return (Node<K,V>)U.getObjectVolatile(tab, ((long)i << ASHIFT) + ABASE);
    }
```

### casTabAt

```java
    /**
    * CAS给Node数组设置值
    */
    static final <K,V> boolean casTabAt(Node<K,V>[] tab, int i,
                                        Node<K,V> c, Node<K,V> v) {
        return U.compareAndSwapObject(tab, ((long)i << ASHIFT) + ABASE, c, v);
    }

```

### helpTransfer

```java

    final Node<K,V>[] helpTransfer(Node<K,V>[] tab, Node<K,V> f) {
        Node<K,V>[] nextTab; int sc;
        // 如果 table不是空且node节点是ForwardingNode类型（数据检验）
        // 且 node 节点的 nextTable（新 table） 不是空（数据校验）
        if (tab != null && (f instanceof ForwardingNode) &&
            (nextTab = ((ForwardingNode<K,V>)f).nextTable) != null) {
            // 算出扩容标志
            int rs = resizeStamp(tab.length);
            // 如果 nextTab 没有被并发修改 且 tab 也没有被并发修改
            // 且 sizeCtl  < 0 （说明还在扩容）
            while (nextTab == nextTable && table == tab &&
                   (sc = sizeCtl) < 0) {
                // TODO: 这里回来再分析
                if ((sc >>> RESIZE_STAMP_SHIFT) != rs || sc == rs + 1 ||
                    sc == rs + MAX_RESIZERS || transferIndex <= 0)
                    break;
                if (U.compareAndSwapInt(this, SIZECTL, sc, sc + 1)) {
                    transfer(tab, nextTab);
                    break;
                }
            }
            return nextTab;
        }
        return table;
    }


```

### resizeStamp （根据当前容量生成一个扩容标记）

根据当前 tab 容量 n 非 0 最高为的 0 的个数与 1 左移 15 进行或运算得出

```java
 static final int resizeStamp(int n) {
    return Integer.numberOfLeadingZeros(n) | (1 << (RESIZE_STAMP_BITS - 1));
 }
```

### treeifyBin

```java

    private final void treeifyBin(Node<K,V>[] tab, int index) {
        // n:数组长度
        Node<K,V> b; int n, sc;
        if (tab != null) {
            // 如果桶的数量小于64，那么不需要链表转树表，没必要，直接扩容数组
            if ((n = tab.length) < MIN_TREEIFY_CAPACITY)
                tryPresize(n << 1);
            // 否则cas获取tab对应index的桶的根元素
            else if ((b = tabAt(tab, index)) != null && b.hash >= 0) {
                // 对于两边转树表的代码代码块进行synchronized加锁
                synchronized (b) {
                    // 双重检查，确定b是否还是index对应桶的根元素
                    if (tabAt(tab, index) == b) {
                        TreeNode<K,V> hd = null, tl = null;
                        for (Node<K,V> e = b; e != null; e = e.next) {
                            TreeNode<K,V> p =
                                new TreeNode<K,V>(e.hash, e.key, e.val,
                                                  null, null);
                            if ((p.prev = tl) == null)
                                hd = p;
                            else
                                tl.next = p;
                            tl = p;
                        }
                        setTabAt(tab, index, new TreeBin<K,V>(hd));
                    }
                }
            }
        }
    }

```

### tryPresize

tryPreSize 是 ConcurrentHashMap 扩容方法之一

```java

    private final void tryPresize(int size) {
        // 如果大小为MAXIMUM_CAPACITY最大总量的一半，那么直接扩容为MAXIMUM_CAPACITY，否则计算最小幂次方
        int c = (size >= (MAXIMUM_CAPACITY >>> 1)) ? MAXIMUM_CAPACITY :
            tableSizeFor(size + (size >>> 1) + 1);
        int sc;
        // 如果sizeCtl为负数说明在其它地方进行了扩容，所以这里的条件是非负数
        while ((sc = sizeCtl) >= 0) {
            Node<K,V>[] tab = table; int n;
            // 如果table还未进行初始化
            if (tab == null || (n = tab.length) == 0) {
                n = (sc > c) ? sc : c;
                // cas修改sizeCtl为-1，表示table正在进行初始化
                if (U.compareAndSwapInt(this, SIZECTL, sc, -1)) {
                    try {
                        // 确认其他线程没有对table修改
                        if (table == tab) {
                            @SuppressWarnings("unchecked")
                            Node<K,V>[] nt = (Node<K,V>[])new Node<?,?>[n];
                            table = nt;
                            // 等价于0.75*n
                            sc = n - (n >>> 2);
                        }
                    } finally {
                        // 将扩容后的阈值赋值给sizeCtl
                        sizeCtl = sc;
                    }
                }
            }
            // 如果扩容大小没有达到阈值，或者超过最大容量
            else if (c <= sc || n >= MAXIMUM_CAPACITY)
                // 退出循环
                break;
            // 确认其他线程没有对table修改
            else if (tab == table) {
                // 根据table的长度生成扩容戳
                int rs = resizeStamp(n);
                if (sc < 0) {
                    Node<K,V>[] nt;
                   /**
                    * 1.sc 右移 16位 是否和当前容量生成的扩容戳相同，相同则代是在同一容量下进行的扩容
                    * 2.第二个和第三个判断 判断当前帮助扩容线程数是否已达到MAX_RESIZERS最大扩容线程数
                    * 3.第四个和第五个判断 为了确保transfer()方法初始化完毕
                    */
                    if ((sc >>> RESIZE_STAMP_SHIFT) != rs || sc == rs + 1 ||
                        sc == rs + MAX_RESIZERS || (nt = nextTable) == null ||
                        transferIndex <= 0)
                        break;
                    if (U.compareAndSwapInt(this, SIZECTL, sc, sc + 1))
                        transfer(tab, nt);
                }
                else if (U.compareAndSwapInt(this, SIZECTL, sc,
                                             (rs << RESIZE_STAMP_SHIFT) + 2))
                    transfer(tab, null);
            }
        }
    }
```

### addCount
