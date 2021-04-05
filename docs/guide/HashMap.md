# HashMap

[参考](https://blog.csdn.net/reliveIT/article/details/82960063)

在阅读源码的时候一直有个问题很困惑就是 HashMap 已经继承了 AbstractMap 而 AbstractMap 类实现了 Map 接口，
那为什么 HashMap 还要在实现 Map 接口呢？同样在 ArrayList 中 LinkedList 中都是这种结构。

:::tip 提示
据 java 集合框架的创始人 Josh Bloch 描述，这样的写法是一个失误。在 java 集合框架中，类似这样的写法很多，最开始写 java 集合框架的时候，
他认为这样写，在某些地方可能是有价值的，直到他意识到错了。显然的，JDK 的维护者，后来不认为这个小小的失误值得去修改，所以就这样存在下来了。
:::

```java
    public class HashMap<K,V> extends AbstractMap<K,V>
        implements Map<K,V>, Cloneable, Serializable {
        ...代码部分省略
    }
```

:::tip 在源码中开头中的第二段注释
Ideally, under random hashCodes, the frequency of nodes in bins follows a Poisson distribution(http://en.wikipedia.org/wiki/Poisson_distribution)
with a parameter of about 0.5 on average for the default resizing threshold of 0.75, although with a large variance because of resizing granularity.

在理想的随机 hashCodes 下，容器中节点的频率遵循泊松分布[参考](http://en.wikipedia.org/wiki/Poisson_distribution)，对于 0.75 的默认调整阈值，泊松分布的概率质量函数中参数 λ（事件发生的平均次数）的值约为 0.5，尽管 λ 的值会因为 load factor 值的调整而产生较大变化。

:::
![泊松分布公式](/images/Poisson_distribution.svg)

这一段注释（甚至是 HashMap 开头的这一大段注释都和 load factor 无关）不是说设置 load factor 为 0.75 的原因，
而是说在默认调整阈值为 0.75 的情况下，泊松分布概率质量函数中的参数 λ=0.5， 带入泊松分布公式，即
长度为 length 的数组中 hash 地放入 0.75\*length 数量的数据，数组中某一个下标放入 k 个数据的概率如下：

- 0: 0.60653066
- 1: 0.30326533
- 2: 0.07581633
- 3: 0.01263606
- 4: 0.00157952
- 5: 0.00015795
- 6: 0.00001316
- 7: 0.00000094
- 8: 0.00000006

这一段乃至 HashMap 开头的一大段注释都没有解释 load factory 默认值是 0.75 的原因，而是说 load factor 的值会影响泊松分布 PMF 函数公式中的参数 λ 的值，例如 load factor=0.75f 时 λ=0.5。按照泊松分布公式来看，
期望放入 bin 中数据的数量 k=8，e 是一个无理常数，λ 的值受 load factor 的值的影响
（泊松分布是用来估算在 一段特定时间或空间内发生成功事件的数量的概率，即在长度为 length 的数组中 hash 地放入 0.75\*length 数量的数据，数组中某一个下标放入 k 个数据的概率）。

- 这一段注释的内容和目的都是为了解释在 java8 HashMap 中引入 Tree Bin（也就是放入数据的每个数组 bin 从链表 node 转换为 red-black tree node）的原因

```text
举个例子说明，HashMap默认的table[].length=16，在长度为16的HashMap中放入12（0.75*length）个数据，某一个bin中存放了8个节点的概率是0.00000006
- 扩容一次，16*2=32，在长度为32的HashMap中放入24个数据，某一个bin中存放了8个节点的概率是0.00000006
- 再扩容一次，32*2=64，在长度为64的HashMap中放入48个数据，某一个bin中存放了8个节点的概率是0.00000006
所以，当某一个bin的节点大于等于8个的时候，就可以从链表node转换为treeNode，其性价比是值得的。
```

## 属性

```java
    /**
     * 默认初始化容量 16 (长度必须是2的幂次方)
     * The default initial capacity - MUST be a power of two.
     */
    static final int DEFAULT_INITIAL_CAPACITY = 1 << 4; // aka 16

    /**
     * 最大容量
     * The maximum capacity, used if a higher value is implicitly specified
     * by either of the constructors with arguments.
     * MUST be a power of two <= 1<<30.
     */
    static final int MAXIMUM_CAPACITY = 1 << 30;

    /**
     * 扩容因子
     * 负载因子太小了浪费空间并且会发生更多次数的resize，太大了哈希冲突增加会导致性能不好，所以0.75只是一个折中的选择
     * The load factor used when none specified in constructor.
     */
    static final float DEFAULT_LOAD_FACTOR = 0.75f;

    /**
     * 当桶(bucket)上的结点数大于这个值时会转成红黑树
     * The bin count threshold for using a tree rather than list for a
     * bin.  Bins are converted to trees when adding an element to a
     * bin with at least this many nodes. The value must be greater
     * than 2 and should be at least 8 to mesh with assumptions in
     * tree removal about conversion back to plain bins upon
     * shrinkage.
     */
    static final int TREEIFY_THRESHOLD = 8;

    /**
     * 当桶(bucket)上的结点数小于这个值时树转链表
     * The bin count threshold for untreeifying a (split) bin during a
     * resize operation. Should be less than TREEIFY_THRESHOLD, and at
     * most 6 to mesh with shrinkage detection under removal.
     */
    static final int UNTREEIFY_THRESHOLD = 6;

    /**
     * 桶中结构转化为红黑树对应的table的最小大小
     * The smallest table capacity for which bins may be treeified.
     * (Otherwise the table is resized if too many nodes in a bin.)
     * Should be at least 4 * TREEIFY_THRESHOLD to avoid conflicts
     * between resizing and treeification thresholds.
     */
    static final int MIN_TREEIFY_CAPACITY = 64;

    /**
     * 存储元素的数组
     */
    transient Node<K,V>[] table;
    /**
     * 存放具体元素的集
     */
    transient Set<Map.Entry<K,V>> entrySet;
    /**
     * 存放元素的个数
     */
    transient int size;
    /**
     * 每次扩容和更改map结构的计数器
     */
    transient int modCount;
```

## 构造方法

```java
    // 默认构造方法
    public HashMap() {
        this.loadFactor = DEFAULT_LOAD_FACTOR; // all other fields defaulted
    }
    // 传入初始化容量
    public HashMap(int initialCapacity) {
        // 使用默认的负载因子
        this(initialCapacity, DEFAULT_LOAD_FACTOR);
    }

    public HashMap(int initialCapacity, float loadFactor) {
        if (initialCapacity < 0)
            // 初始化容量小于0 抛出参数异常
            throw new IllegalArgumentException("Illegal initial capacity: " +
                                               initialCapacity);
        // 保证容量不超过 MAXIMUM_CAPACITY
        if (initialCapacity > MAXIMUM_CAPACITY)
            initialCapacity = MAXIMUM_CAPACITY;
        // 检查负载因子
        if (loadFactor <= 0 || Float.isNaN(loadFactor))
            throw new IllegalArgumentException("Illegal load factor: " +
                                               loadFactor);
        this.loadFactor = loadFactor;
        // 初始化 扩容临界值
        this.threshold = tableSizeFor(initialCapacity);
    }
    // 根据传入的 map 进行初始化
    public HashMap(Map<? extends K, ? extends V> m) {
        this.loadFactor = DEFAULT_LOAD_FACTOR;
        putMapEntries(m, false);
    }
```

## 方法

### tableSizeFor

计算大于等于容量最小的 2 次幂

```java
    static final int tableSizeFor(int cap) {
        // 这里减一是为了防止传入的cap本身就是2的幂次方导致计算完后是传入的2倍
        int n = cap - 1;
        n |= n >>> 1;
        n |= n >>> 2;
        n |= n >>> 4;
        n |= n >>> 8;
        n |= n >>> 16;
        return (n < 0) ? 1 : (n >= MAXIMUM_CAPACITY) ? MAXIMUM_CAPACITY : n + 1;
    }
```

### putMapEntries

```java
    final void putMapEntries(Map<? extends K, ? extends V> m, boolean evict) {
        int s = m.size();
        if (s > 0) {
            if (table == null) { // pre-size
                // 如果table为空则要初始化
                // HashMap底层的table在 entry_count > table_size * load_factor
                // 为了不让 HashMap 扩容，需要 table_size >= entry_count / load_factor
                // 公式((float)s / loadFactor) + 1.0F中的size是使用float计算的，+1.0F是因为((float)s / loadFactor)使用float计算，
                // 在转换成整数的时候会进行舍入，为了保证最终计算出来的size足够大不至于触发扩容，所以进行了+ 1.0F操作
                float ft = ((float)s / loadFactor) + 1.0F;
                int t = ((ft < (float)MAXIMUM_CAPACITY) ?
                         (int)ft : MAXIMUM_CAPACITY);
                if (t > threshold)
                    // 这里的threshold成员实际存放的值是capacity的值。因为在table还没有初始化时（table还是null），
                    // 用户给定的capacity会暂存到threshold成员上去（毕竟HashMap没有一个成员叫做capacity，capacity是作为table数组的大小而隐式存在的）
                    threshold = tableSizeFor(t);
            }
            else if (s > threshold)
                // 说明传入map的size都已经大于当前map的threshold了，即当前map肯定是装不下两个map的并集的，所以这里必须要执行resize操作
                resize();
            for (Map.Entry<? extends K, ? extends V> e : m.entrySet()) {
                K key = e.getKey();
                V value = e.getValue();
                // 循环putVal
                putVal(hash(key), key, value, false, evict);
            }
        }
    }

```

### hash

[参考自](https://blog.csdn.net/yueaini10000/article/details/108869022)

`扰动函数`

- 一定要尽可能降低 hash 碰撞，越分散越好
- 算法一定要尽可能高效，因为这是高频操作, 因此采用位运算

:::tip 提示
因为 key.hashCode()函数调用的是 key 键值类型自带的哈希函数，返回 int 型散列值。int 值范围为 -2147483648~2147483647 ，
前后加起来大概 40 亿的映射空间。只要哈希函数映射得比较均匀松散，一般应用是很难出现碰撞的。但问题是一个 40 亿长度的数组，内存是放不下的。
你想，如果 HashMap 数组的初始大小才 16，用之前需要对数组的长度取模运算，得到的余数才能用来访问数组下标。
:::

右位移 16 位，正好是 32bit 的一半，自己的高半区和低半区做异或，就是为了混合原始哈希码的高位和低位，以此来加大低位的随机性。
而且混合后的低位掺杂了高位的部分特征，这样高位的信息也被变相保留下来。

```java
    static final int hash(Object key) {
        int h;
        return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
    }

```

### putVal

```java
    final V putVal(int hash, K key, V value, boolean onlyIfAbsent,
                   boolean evict) {

        Node<K,V>[] tab; Node<K,V> p; int n, i;
        // 先赋值 tab=table，n=tab.length（n指数组长度）
        // 数组未初始化或者为空
        if ((tab = table) == null || (n = tab.length) == 0)
            // 调用 resize 扩容
            n = (tab = resize()).length;
        if ((p = tab[i = (n - 1) & hash]) == null)
            // 没有hash冲突
            tab[i] = newNode(hash, key, value, null);
        else {
            Node<K,V> e; K k;
            // put进来的key 如果 hash值冲突 并且key值相等或者对象equal是一样的
            if (p.hash == hash &&
                ((k = p.key) == key || (key != null && key.equals(k))))
                // 直接e指向p
                e = p;
            else if (p instanceof TreeNode)
                // r如果p是TreeNode实例那么调用TreeNode 的putTreeVal
                e = ((TreeNode<K,V>)p).putTreeVal(this, tab, hash, key, value);
            else {
                // 这里要统计链表的数量，好控制树化
                for (int binCount = 0; ; ++binCount) {
                    if ((e = p.next) == null) {
                        // 往链表的下一个塞入Node
                        p.next = newNode(hash, key, value, null);
                        // 如果 链表的数量达到临界值，进行树化
                        if (binCount >= TREEIFY_THRESHOLD - 1) // -1 for 1st
                            treeifyBin(tab, hash);
                        break;
                    }
                    if (e.hash == hash &&
                        ((k = e.key) == key || (key != null && key.equals(k))))
                        break;
                    p = e;
                }
            }
            if (e != null) { // existing mapping for key
                V oldValue = e.value;
                if (!onlyIfAbsent || oldValue == null)
                    e.value = value;
                afterNodeAccess(e);
                return oldValue;
            }
        }
        ++modCount;
        if (++size > threshold)
            resize();
        afterNodeInsertion(evict);
        return null;
    }
```

### resize

```java

    final Node<K,V>[] resize() {
        // 获取Node数组
        Node<K,V>[] oldTab = table;
        // 旧容量
        int oldCap = (oldTab == null) ? 0 : oldTab.length;
        // 旧阈值
        int oldThr = threshold;
        int newCap, newThr = 0;
        if (oldCap > 0) {
            if (oldCap >= MAXIMUM_CAPACITY) {
                threshold = Integer.MAX_VALUE;
                return oldTab;
            }
            else if ((newCap = oldCap << 1) < MAXIMUM_CAPACITY &&
                     oldCap >= DEFAULT_INITIAL_CAPACITY)
                newThr = oldThr << 1; // double threshold
        }
        else if (oldThr > 0) // initial capacity was placed in threshold
            // 旧容量为0，但是旧阈值大于0，说明这个值是 map初始化容量值暂存的
            newCap = oldThr;
        else {
            // zero initial threshold signifies using defaults
            // 当oldThr==0时，也就是使用无参构造函数时
            // 初始容量：16，阈值 16*0.75 = 12
            newCap = DEFAULT_INITIAL_CAPACITY;
            newThr = (int)(DEFAULT_LOAD_FACTOR * DEFAULT_INITIAL_CAPACITY);
        }
        if (newThr == 0) {
            // 当oldThr代表的是容量的时候，是没有阈值的，需要我们重新计算
            float ft = (float)newCap * loadFactor;
            // 如果负载因子不是0.75，时别的小数呢？阈值向下取整，保证到达阈值一定能resize
            // 同理上面 map参数初始化，根据map.size计算容量向上取整，保证达到既定容量不会触发resize
            newThr = (newCap < MAXIMUM_CAPACITY && ft < (float)MAXIMUM_CAPACITY ?
                      (int)ft : Integer.MAX_VALUE);
        }
        threshold = newThr;
        @SuppressWarnings({"rawtypes","unchecked"})
        // 根据新容量创建数组
        Node<K,V>[] newTab = (Node<K,V>[])new Node[newCap];
        // table指向扩容后的新数组
        table = newTab;
        // 如果oldTab不为空，那我们要拷贝数据
        if (oldTab != null) {
            // 遍历oldTab
            for (int j = 0; j < oldCap; ++j) {
                Node<K,V> e;
                // Node【e】指向当前循环节点（在构造Node节点对象时，hash已经计算好了）
                if ((e = oldTab[j]) != null) {
                    // oldTab相应下表数据置null，GC
                    oldTab[j] = null;
                    if (e.next == null)
                        // 如果Node不是链表
                        // e.hash & (newCap -1) 计算对应下标，这里也就印证了为什么容量要是2的幂次方
                        // e.hash % length 当 length 为 2幂次方时 操作等价于 e.hash & (newCap-1)
                        newTab[e.hash & (newCap - 1)] = e;
                    else if (e instanceof TreeNode)
                        // 如果节点是红黑树节点
                        ((TreeNode<K,V>)e).split(this, newTab, j, oldCap);
                    else { // preserve order
                        // 如果节点是链表
                        // 分出高，低位链表
                        Node<K,V> loHead = null, loTail = null;
                        Node<K,V> hiHead = null, hiTail = null;
                        Node<K,V> next;
                        do {
                            next = e.next;
                            // 判断是不是原数组的位置
                            if ((e.hash & oldCap) == 0) {
                                if (loTail == null)
                                    loHead = e;
                                else
                                    loTail.next = e;
                                loTail = e;
                            }
                            else {
                                if (hiTail == null)
                                    hiHead = e;
                                else
                                    hiTail.next = e;
                                hiTail = e;
                            }
                        } while ((e = next) != null);
                        // 如果低位链表尾节点不为空，
                        if (loTail != null) {
                            loTail.next = null;
                            // 插入原来相应的位置
                            newTab[j] = loHead;
                        }
                        // 如果低位链表尾节点不为空，
                        if (hiTail != null) {
                            hiTail.next = null;
                            // 指向新的位置
                            newTab[j + oldCap] = hiHead;
                        }
                    }
                }
            }
        }
        return newTab;
    }
```

### treeifyBin

如果元素数组为空 或者 数组长度小于 树结构化的最小限制
MIN_TREEIFY_CAPACITY 默认值 64，对于这个值可以理解为：如果元素数组长度小于这个值，没有必要去进行结构转换
当一个数组位置上集中了多个键值对，那是因为这些 key 的 hash 值和数组长度取模之后结果相同。（并不是因为这些 key 的 hash 值相同）
因为 hash 值相同的概率不高，所以可以通过扩容的方式，来使得最终这些 key 的 hash 值在和新的数组长度取模之后，拆分到多个数组位置上。

```java
    final void treeifyBin(Node<K, V>[] tab, int hash) {
        int n, index;
        Node<K, V> e;
        if (tab == null || (n = tab.length) < MIN_TREEIFY_CAPACITY) {
            resize();
        } else if ((e = tab[index = (n - 1) & hash]) != null) {
            TreeNode<K, V> hd = null, tl = null;
            do {
                TreeNode<K, V> p = replacementTreeNode(e, null);
                if (tl == null) {
                    hd = p;
                } else {
                    p.prev = tl;
                    tl.next = p;
                }
                tl = p;
            } while ((e = e.next) != null);
            if ((tab[index] = hd) != null) {
                hd.treeify(tab);
            }
        }
    }

```

## TreeNode（内部类）

同时是树表也是链表

```java
    static final class TreeNode<K,V> extends LinkedHashMap.Entry<K,V> {}
```

###构造方法

```java
    TreeNode(int hash, K key, V val, Node<K,V> next) {
        super(hash, key, val, next);
    }
```

### split

因为数组已经扩容 2 倍了，树上的节点需要重新计算索引位置

旧索引 index=has & (cap-1)

新索引 index=has & (2cap-1) ==> (hash & cap)&((cap-1) &hash)

如果新索引不变化的话，hash & cap===0 就表示索引位置不变
新的索引也就比就索引多了一个 cap 的长度

TreeNode 既是树表也是链表

:::tip 重要

- 为 0 时，将该节点头结点放到新数组的索引位置等于其在旧数组时的索引位置，记为低位链表头 loHead
- 不等于 0 时，将该节点头结点放到新数组的索引位置等于其在旧数组时的索引位置再加上旧数组长度，记为高位链表头 hiHead

:::

[参考](https://blog.csdn.net/u010425839/article/details/106620440/)

```java
    final void split(HashMap<K,V> map, Node<K,V>[] tab, int index, int bit) {
        TreeNode<K,V> b = this;
        // Relink into lo and hi lists, preserving order
        TreeNode<K,V> loHead = null, loTail = null;
        TreeNode<K,V> hiHead = null, hiTail = null;
        int lc = 0, hc = 0;
        // 这个for循环就是对从e节点开始对整个红黑树做遍历
        for (TreeNode<K,V> e = b, next; e != null; e = next) {
            // 取e的下一节点赋值给next遍历
            next = (TreeNode<K,V>)e.next;
            // 取好e的下一节点后，把它赋值为空，方便GC回收
            e.next = null;
            if ((e.hash & bit) == 0) {
                // 索引位置不变时
                if ((e.prev = loTail) == null)
                    loHead = e;
                else
                    loTail.next = e;
                loTail = e;
                // 做个计数，看下拉出低位链表下会有几个元素
                ++lc;
            }
            else {
                if ((e.prev = hiTail) == null)
                    hiHead = e;
                else
                    hiTail.next = e;
                hiTail = e;
                // 做个计数，看下拉出高位链表下会有几个元素
                ++hc;
            }
        }
        // 如果低位链表首节点不为null，说明有这个链表存在
        if (loHead != null) {
            // 如果链表下的元素小于等于6
            if (lc <= UNTREEIFY_THRESHOLD)
                //那就从红黑树转链表了，低位链表，迁移到新数组中下标不变，还是等于原数组到下标
                tab[index] = loHead.untreeify(map);
            else {
                // 低位链表，迁移到新数组中下标不变，还是等于原数组到下标，把低位链表整个拉到这个下标下，做个赋值
                tab[index] = loHead;
                 // 如果高位首节点不为空，说明原来的红黑树已经被拆分成两个链表了
                if (hiHead != null) // (else is already treeified)
                    // 那么就需要构建低位一个新的红黑树了
                    loHead.treeify(tab);
            }
        }
        // 如果高位链表首节点不为null，说明有这个链表存在
        if (hiHead != null) {
            // 如果链表下的元素小于等于6
            if (hc <= UNTREEIFY_THRESHOLD)
                // 那就从红黑树转链表了，高位链表，迁移到新数组中的下标=【旧数组+旧数组长度】
                tab[index + bit] = hiHead.untreeify(map);
            else {
                // 高位链表，迁移到新数组中的下标=【旧数组+旧数组长度】
                tab[index + bit] = hiHead;
                if (loHead != null)
                    // 如果低位首节点不为空，说明原来的红黑树已经被拆分成两个链表了
                    hiHead.treeify(tab);
            }
        }
    }
```

### untreeify

```java
    final Node<K,V> untreeify(HashMap<K,V> map) {
        // this是链表头节点
        Node<K,V> hd = null, tl = null;
        for (Node<K,V> q = this; q != null; q = q.next) {
            // 将TreeNode 换成链表的 Node
            Node<K,V> p = map.replacementNode(q, null);
            if (tl == null)
                hd = p;
            else
                tl.next = p;
            tl = p;
        }
        return hd;
    }
```

### treeify

```java
    final void treeify(Node<K,V>[] tab) {
        TreeNode<K,V> root = null;
        for (TreeNode<K,V> x = this, next; x != null; x = next) {
            // 获取下个节点
            next = (TreeNode<K,V>)x.next;
            // 因为是重新生成树，所以 x的left，right都置空
            x.left = x.right = null;
            if (root == null) {
                // 第一次root肯定是空
                x.parent = null;
                x.red = false;
                root = x;
            }
            else {
                // key值
                K k = x.key;
                // x节点的hash值
                int h = x.hash;
                Class<?> kc = null;
                // 从根节点遍历插入节点
                for (TreeNode<K,V> p = root;;) {
                    // dir代表差值
                    // ph代表父亲节点hash值
                    int dir, ph;
                    K pk = p.key;
                    if ((ph = p.hash) > h)
                        dir = -1;
                    else if (ph < h)
                        dir = 1;

                    /*
                     * 如果两个节点的key的hash值相等，那么还要通过其他方式再进行比较
                     * 如果当前链表节点的key实现了comparable接口，并且当前树节点和链表节点是相同Class的实例，那么通过comparable的方式再比较两者。
                     * 如果还是相等，最后再通过tieBreakOrder比较一次
                     */
                    else if ((kc == null &&
                              (kc = comparableClassFor(k)) == null) ||
                             (dir = compareComparables(kc, k, pk)) == 0)
                        dir = tieBreakOrder(k, pk);
                    // 保存当前树节点
                    TreeNode<K,V> xp = p;
                    if ((p = (dir <= 0) ? p.left : p.right) == null) {
                        // 当前链表节点 作为 当前树节点的子节点
                        x.parent = xp;
                        if (dir <= 0)
                            xp.left = x;
                        else
                            xp.right = x;
                        // 插入节点之后需要调整红黑树平衡
                        root = balanceInsertion(root, x);
                        break;
                    }
                }
            }
        }
        moveRootToFront(tab, root);
    }

```

### balanceInsertion

```java
    static <K, V> TreeNode<K, V> balanceInsertion(TreeNode<K, V> root,
                                                  TreeNode<K, V> x) {
        // 插入节点默认为红色
        x.red = true;
        // 这里定义了4个变量
        // xp：当前节点的父节点、xpp：爷爷节点、xppl：左叔叔节点、xppr：右叔叔节点
        for (TreeNode<K, V> xp, xpp, xppl, xppr; ; ) {
            // 如果父节点为空、说明当前没有根节点
            if ((xp = x.parent) == null) {
                x.red = false;
                // 将x返回过去成为根节点
                return x;
            } else if (!xp.red || (xpp = xp.parent) == null) {
                // 如果xp是根节点，不需要调整over
                return root;
            }
            // 如果父节点是爷爷节点的左孩子
            if (xp == (xppl = xpp.left)) {
                // 爷爷的右子树不为空，并且是红色节点
                if ((xppr = xpp.right) != null && xppr.red) {
                    // 父亲和叔叔节点染黑，爷爷节点染红，指针回溯至爷爷节点接着调整
                    xppr.red = false;
                    xp.red = false;
                    xpp.red = true;
                    x = xpp;
                } else {
                    // 如果右叔叔为空 或者 为黑色
                    if (x == xp.right) {
                        // x节点是右子树
                        // 将x的父节点进行左旋，指针x指向xp
                        root = rotateLeft(root, x = xp);
                        // 重新获取 xp,xpp节点
                        xpp = (xp = x.parent) == null ? null : xp.parent;
                    }
                    // x，xp,xpp在一条线上了 ，xp染黑其余染红，右旋xpp
                    if (xp != null) {
                        xp.red = false;
                        if (xpp != null) {
                            xpp.red = true;
                            root = rotateRight(root, xpp);
                        }
                    }
                }
            } else {
                // 如果父节点是爷爷节点的右孩子
                if (xppl != null && xppl.red) {
                    xppl.red = false;
                    xp.red = false;
                    xpp.red = true;
                    x = xpp;
                } else {
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

```

### putTreeVal

```java
    final TreeNode<K, V> putTreeVal(HashMap<K, V> map, Node<K, V>[] tab,
                                        int h, K k, V v) {
        Class<?> kc = null;
        // 是否找到节点标志
        boolean searched = false;
        TreeNode<K, V> root = (parent != null) ? root() : this;
        for (TreeNode<K, V> p = root; ; ) {
            int dir, ph;
            K pk;
            if ((ph = p.hash) > h) {
                dir = -1;
            } else if (ph < h) {
                dir = 1;
            } else if ((pk = p.key) == k || (k != null && k.equals(pk))) {
                // 这里直接找到了节点
                return p;
            } else if ((kc == null &&
                    (kc = comparableClassFor(k)) == null) ||
                    (dir = compareComparables(kc, k, pk)) == 0) {
                // 说明进入下面这个判断的条件是 hash相同 但是equal不同
				// 没有实现Comparable<C>接口或者 实现该接口 并且 k与pk Comparable比较结果相同
                if (!searched) {
                    TreeNode<K, V> q, ch;
                    searched = true;
                    // 在左右子树递归的寻找 是否有key的hash相同  并且equals相同的节点
                    if (((ch = p.left) != null &&
                            (q = ch.find(h, k, kc)) != null) ||
                            ((ch = p.right) != null &&
                                    (q = ch.find(h, k, kc)) != null)) {
                        // 找到了就返回
                        return q;
                    }
                }
                dir = tieBreakOrder(k, pk);
            }
            // 说明红黑树中没有与之equals相等的  那就必须进行插入操作
            // 打破平衡的方法的 分出大小 结果 只有-1 1
            // 到这里已经找到了要插入节点P
            // 将xp指向p（父节点）
            TreeNode<K, V> xp = p;
            if ((p = (dir <= 0) ? p.left : p.right) == null) {
                Node<K, V> xpn = xp.next;
                // 实例化TreeNode
                TreeNode<K, V> x = map.newTreeNode(h, k, v, xpn);
                if (dir <= 0) {
                    xp.left = x;
                } else {
                    xp.right = x;
                }
                // 连接前后，树父母关系
                xp.next = x;
                x.parent = x.prev = xp;
                if (xpn != null) {
                    ((TreeNode<K, V>) xpn).prev = x;
                }
                moveRootToFront(tab, balanceInsertion(root, x));
                return null;
            }
        }
    }
```
